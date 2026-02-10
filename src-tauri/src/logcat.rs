use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

use chrono::Local;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

// ---------------------------------------------------------------------------
// Structs
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogcatLine {
    pub timestamp: String,
    pub pid: String,
    pub tid: String,
    pub level: String,
    pub tag: String,
    pub message: String,
    pub raw: String,
}

/// Managed state: tracks active logcat streams per device serial.
/// Value is the sidecar child PID so we can kill it later.
pub struct LogcatState {
    pub active_streams: Mutex<HashMap<String, u32>>,
}

impl LogcatState {
    pub fn new() -> Self {
        Self {
            active_streams: Mutex::new(HashMap::new()),
        }
    }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/// Parse a logcat threadtime line.
///
/// Format: `MM-DD HH:MM:SS.mmm  PID  TID LEVEL TAG     : message`
///
/// Example: `01-15 12:34:56.789  1234  5678 D MyTag   : hello world`
pub fn parse_logcat_line(line: &str) -> Option<LogcatLine> {
    let raw = line.to_string();
    let trimmed = line.trim();

    // Minimum viable line: "MM-DD HH:MM:SS.mmm  PID  TID L TAG: msg"
    // Date part is at least 18 chars: "01-15 12:34:56.789"
    if trimmed.len() < 20 {
        return None;
    }

    // Validate date prefix pattern: MM-DD HH:MM:SS.mmm
    let bytes = trimmed.as_bytes();
    if bytes[2] != b'-' || bytes[5] != b' ' || bytes[8] != b':' || bytes[11] != b':' || bytes[14] != b'.' {
        return None;
    }

    let timestamp = trimmed[..18].to_string();

    // After timestamp, split the rest by whitespace
    let rest = trimmed[18..].trim_start();
    let parts: Vec<&str> = rest.splitn(4, char::is_whitespace).collect();
    if parts.len() < 4 {
        return None;
    }

    let pid = parts[0].trim().to_string();
    let remaining = rest[parts[0].len()..].trim_start();
    let parts2: Vec<&str> = remaining.splitn(3, char::is_whitespace).collect();
    if parts2.len() < 3 {
        return None;
    }

    let tid = parts2[0].trim().to_string();
    let after_tid = remaining[parts2[0].len()..].trim_start();
    let parts3: Vec<&str> = after_tid.splitn(2, char::is_whitespace).collect();
    if parts3.is_empty() {
        return None;
    }

    let level = parts3[0].trim().to_string();

    // Validate level is a known logcat level
    match level.as_str() {
        "V" | "D" | "I" | "W" | "E" | "F" | "S" => {}
        _ => return None,
    }

    let after_level = if parts3.len() > 1 {
        after_tid[parts3[0].len()..].trim_start()
    } else {
        ""
    };

    // Tag and message are separated by ": "
    let (tag, message) = if let Some(colon_pos) = after_level.find(": ") {
        (
            after_level[..colon_pos].trim().to_string(),
            after_level[colon_pos + 2..].to_string(),
        )
    } else if after_level.ends_with(':') {
        // Tag with empty message
        (after_level[..after_level.len() - 1].trim().to_string(), String::new())
    } else {
        (after_level.trim().to_string(), String::new())
    };

    Some(LogcatLine {
        timestamp,
        pid,
        tid,
        level,
        tag,
        message,
        raw,
    })
}

// ---------------------------------------------------------------------------
// Log directory management
// ---------------------------------------------------------------------------

/// Returns `~/AdbTool/logs/`, creating it if necessary.
pub fn get_log_dir() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let log_dir = home.join("AdbTool").join("logs");
    if !log_dir.exists() {
        let _ = fs::create_dir_all(&log_dir);
    }
    log_dir
}

/// Delete log files whose last modification time is older than 7 days.
pub fn cleanup_old_logs() {
    let log_dir = get_log_dir();
    let Ok(entries) = fs::read_dir(&log_dir) else {
        return;
    };

    let seven_days = std::time::Duration::from_secs(7 * 24 * 60 * 60);
    let now = std::time::SystemTime::now();

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        if let Ok(metadata) = path.metadata() {
            if let Ok(modified) = metadata.modified() {
                if let Ok(age) = now.duration_since(modified) {
                    if age > seven_days {
                        let _ = fs::remove_file(&path);
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Stream control
// ---------------------------------------------------------------------------

/// Start a logcat stream for the given device.
///
/// Spawns `adb -s {serial} logcat -v threadtime` via sidecar, reads stdout
/// line-by-line, writes each line to a log file, parses it, and emits a
/// `logcat-line-{serial}` event to the frontend.
///
/// Returns the child PID on success.
pub async fn start_stream(app: &AppHandle, serial: &str) -> Result<u32, String> {
    // Check if already streaming
    {
        let state = app.state::<LogcatState>();
        let streams = state.active_streams.lock().map_err(|e| e.to_string())?;
        if streams.contains_key(serial) {
            return Err(format!("Logcat stream already active for device {}", serial));
        }
    }

    // Prepare log file
    let log_dir = get_log_dir();
    let timestamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
    let log_filename = format!("logcat_{}_{}.log", serial, timestamp);
    let log_path = log_dir.join(&log_filename);

    let mut log_file = fs::File::create(&log_path)
        .map_err(|e| format!("Failed to create log file: {}", e))?;

    // Spawn sidecar with streaming
    let (mut rx, child) = app
        .shell()
        .sidecar("binaries/adb")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?
        .args(&["-s", serial, "logcat", "-v", "threadtime"])
        .spawn()
        .map_err(|e| format!("Failed to spawn logcat: {}", e))?;

    let child_pid = child.pid();

    // Store in active streams
    {
        let state = app.state::<LogcatState>();
        let mut streams = state.active_streams.lock().map_err(|e| e.to_string())?;
        streams.insert(serial.to_string(), child_pid);
    }

    // Clone what we need for the async task
    let app_handle = app.clone();
    let serial_owned = serial.to_string();
    let event_name = format!("logcat-line-{}", serial);

    // Spawn async reader task
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes).to_string();

                    // Write to log file (ignore write errors to keep streaming)
                    let _ = writeln!(log_file, "{}", line);

                    // Parse and emit to frontend
                    if let Some(parsed) = parse_logcat_line(&line) {
                        let _ = app_handle.emit(&event_name, &parsed);
                    } else if !line.trim().is_empty() {
                        // Emit unparseable non-empty lines as raw
                        let raw_line = LogcatLine {
                            timestamp: String::new(),
                            pid: String::new(),
                            tid: String::new(),
                            level: String::new(),
                            tag: String::new(),
                            message: line.clone(),
                            raw: line,
                        };
                        let _ = app_handle.emit(&event_name, &raw_line);
                    }
                }
                CommandEvent::Stderr(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes).to_string();
                    let _ = writeln!(log_file, "[STDERR] {}", line);
                }
                CommandEvent::Terminated(status) => {
                    let _ = writeln!(
                        log_file,
                        "\n--- logcat terminated: {:?} ---",
                        status
                    );

                    // Clean up from active streams
                    if let Some(state) = app_handle.try_state::<LogcatState>() {
                        if let Ok(mut streams) = state.active_streams.lock() {
                            streams.remove(&serial_owned);
                        }
                    }
                    break;
                }
                CommandEvent::Error(err) => {
                    let _ = writeln!(log_file, "[ERROR] {}", err);
                }
                _ => {}
            }
        }
    });

    Ok(child_pid)
}

/// Stop the logcat stream for the given device.
///
/// Removes the stream from active_streams. The sidecar process is killed
/// by dropping it through Tauri's command child API.
pub async fn stop_stream(app: &AppHandle, serial: &str) -> Result<(), String> {
    let pid = {
        let state = app.state::<LogcatState>();
        let mut streams = state.active_streams.lock().map_err(|e| e.to_string())?;
        streams
            .remove(serial)
            .ok_or_else(|| format!("No active logcat stream for device {}", serial))?
    };

    // Kill the sidecar process by PID using system kill
    #[cfg(unix)]
    {
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }
    }

    #[cfg(windows)]
    {
        let _ = std::process::Command::new("taskkill")
            .args(&["/PID", &pid.to_string(), "/F"])
            .output();
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_logcat_line_normal() {
        let line = "01-15 12:34:56.789  1234  5678 D MyTag   : hello world";
        let parsed = parse_logcat_line(line).expect("should parse");
        assert_eq!(parsed.timestamp, "01-15 12:34:56.789");
        assert_eq!(parsed.pid, "1234");
        assert_eq!(parsed.tid, "5678");
        assert_eq!(parsed.level, "D");
        assert_eq!(parsed.tag, "MyTag");
        assert_eq!(parsed.message, "hello world");
    }

    #[test]
    fn test_parse_logcat_line_error_level() {
        let line = "12-25 08:00:00.000  9999    42 E SomeTag : error msg";
        let parsed = parse_logcat_line(line).expect("should parse");
        assert_eq!(parsed.level, "E");
        assert_eq!(parsed.tag, "SomeTag");
        assert_eq!(parsed.message, "error msg");
    }

    #[test]
    fn test_parse_logcat_line_invalid() {
        assert!(parse_logcat_line("").is_none());
        assert!(parse_logcat_line("not a logcat line").is_none());
        assert!(parse_logcat_line("--------- beginning of main").is_none());
    }

    #[test]
    fn test_parse_logcat_line_with_spaces_in_message() {
        let line = "03-10 14:22:33.456  1000  2000 I ActivityManager: Start proc 1234:com.example/u0a12 for activity";
        let parsed = parse_logcat_line(line).expect("should parse");
        assert_eq!(parsed.tag, "ActivityManager");
        assert!(parsed.message.contains("Start proc"));
    }
}
