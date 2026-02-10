use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

use crate::error_codes;

// ---------------------------------------------------------------------------
// Structs
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdbDevice {
    pub serial: String,
    pub state: String,
    pub model: String,
    pub product: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceDetail {
    pub serial: String,
    pub model: String,
    pub android_version: String,
    pub sdk_version: String,
    pub storage_total_mb: u64,
    pub storage_free_mb: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledApp {
    pub package_name: String,
    pub version_name: String,
    pub version_code: String,
    pub is_system: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallResult {
    pub success: bool,
    pub error_code: Option<String>,
    pub error_message_cn: Option<String>,
    pub suggestion: Option<String>,
    pub auto_fix: Option<String>,
    pub raw_output: String,
}

// ---------------------------------------------------------------------------
// Core executors
// ---------------------------------------------------------------------------

/// Run adb via sidecar, return stdout on success.
/// Returns Err only if the sidecar process itself fails to spawn/run.
pub async fn exec(app: &AppHandle, args: &[&str]) -> Result<String, String> {
    let output = app
        .shell()
        .sidecar("binaries/adb")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?
        .args(args)
        .output()
        .await
        .map_err(|e| format!("Failed to execute adb: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    // Return stdout even for non-zero exits (adb install returns 0 on failure)
    // Only fail if there's no useful output at all and stderr has content
    if stdout.trim().is_empty() && !stderr.trim().is_empty() && !output.status.success() {
        return Err(format!("adb error: {}", stderr.trim()));
    }

    Ok(stdout)
}

/// Run adb with `-s serial` prefix.
pub async fn exec_device(app: &AppHandle, serial: &str, args: &[&str]) -> Result<String, String> {
    let mut full_args: Vec<&str> = vec!["-s", serial];
    full_args.extend_from_slice(args);
    exec(app, &full_args).await
}

// ---------------------------------------------------------------------------
// Device management
// ---------------------------------------------------------------------------

/// Parse `adb devices -l` output into a list of AdbDevice.
pub async fn list_devices(app: &AppHandle) -> Result<Vec<AdbDevice>, String> {
    let output = exec(app, &["devices", "-l"]).await?;
    let mut devices = Vec::new();

    for line in output.lines().skip(1) {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 2 {
            continue;
        }

        let serial = parts[0].to_string();
        let state = parts[1].to_string();

        let mut model = String::new();
        let mut product = String::new();

        for part in &parts[2..] {
            if let Some(val) = part.strip_prefix("model:") {
                model = val.to_string();
            } else if let Some(val) = part.strip_prefix("product:") {
                product = val.to_string();
            }
        }

        devices.push(AdbDevice {
            serial,
            state,
            model,
            product,
        });
    }

    Ok(devices)
}

/// Get detailed device info via getprop and df.
pub async fn get_device_detail(
    app: &AppHandle,
    serial: &str,
) -> Result<DeviceDetail, String> {
    // Fetch properties in parallel-style (sequential for simplicity, all fast)
    let model = exec_device(app, serial, &["shell", "getprop", "ro.product.model"])
        .await
        .unwrap_or_default()
        .trim()
        .to_string();

    let android_version =
        exec_device(app, serial, &["shell", "getprop", "ro.build.version.release"])
            .await
            .unwrap_or_default()
            .trim()
            .to_string();

    let sdk_version =
        exec_device(app, serial, &["shell", "getprop", "ro.build.version.sdk"])
            .await
            .unwrap_or_default()
            .trim()
            .to_string();

    // Parse storage from `df /data`
    let df_output = exec_device(app, serial, &["shell", "df", "/data"])
        .await
        .unwrap_or_default();

    let (storage_total_mb, storage_free_mb) = parse_df_output(&df_output);

    Ok(DeviceDetail {
        serial: serial.to_string(),
        model,
        android_version,
        sdk_version,
        storage_total_mb,
        storage_free_mb,
    })
}

/// Parse `df` output to extract total and free storage in MB.
/// df output typically has columns: Filesystem, 1K-blocks, Used, Available, Use%, Mounted on
fn parse_df_output(output: &str) -> (u64, u64) {
    for line in output.lines().skip(1) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 4 {
            // 1K-blocks = total, Available = free
            let total_kb = parts[1]
                .replace('K', "")
                .parse::<u64>()
                .unwrap_or(0);
            let free_kb = parts[3]
                .replace('K', "")
                .parse::<u64>()
                .unwrap_or(0);
            return (total_kb / 1024, free_kb / 1024);
        }
    }
    (0, 0)
}

// ---------------------------------------------------------------------------
// App installation / management
// ---------------------------------------------------------------------------

/// Install an APK with optional flags. Parses error codes from stdout.
pub async fn install_apk(
    app: &AppHandle,
    serial: &str,
    apk_path: &str,
    flags: &[&str],
) -> Result<InstallResult, String> {
    let mut args: Vec<&str> = vec!["install"];
    args.extend_from_slice(flags);
    args.push(apk_path);

    let raw_output = exec_device(app, serial, &args).await?;

    if raw_output.contains("Success") {
        return Ok(InstallResult {
            success: true,
            error_code: None,
            error_message_cn: None,
            suggestion: None,
            auto_fix: None,
            raw_output,
        });
    }

    let error_code = extract_error_code(&raw_output);
    let (message_cn, suggestion, auto_fix) = error_codes::translate_error(&error_code);

    Ok(InstallResult {
        success: false,
        error_code: Some(error_code),
        error_message_cn: Some(message_cn),
        suggestion: Some(suggestion),
        auto_fix,
        raw_output,
    })
}

/// Uninstall an app by package name.
pub async fn uninstall_app(
    app: &AppHandle,
    serial: &str,
    package_name: &str,
) -> Result<String, String> {
    exec_device(app, serial, &["uninstall", package_name]).await
}

/// List installed packages. When `include_system` is false, only third-party apps.
pub async fn list_packages(
    app: &AppHandle,
    serial: &str,
    include_system: bool,
) -> Result<Vec<InstalledApp>, String> {
    let flag = if include_system { "" } else { "-3" };
    let args = if flag.is_empty() {
        vec!["shell", "pm", "list", "packages", "-f"]
    } else {
        vec!["shell", "pm", "list", "packages", flag, "-f"]
    };

    let output = exec_device(app, serial, &args).await?;
    let mut apps = Vec::new();

    for line in output.lines() {
        let line = line.trim();
        // Format: package:/data/app/.../base.apk=com.example.app
        if let Some(rest) = line.strip_prefix("package:") {
            if let Some(eq_pos) = rest.rfind('=') {
                let package_name = rest[eq_pos + 1..].to_string();
                let apk_path = &rest[..eq_pos];
                let is_system = apk_path.starts_with("/system");

                // Try to get version info via dumpsys
                let (version_name, version_code) =
                    get_app_version(app, serial, &package_name).await;

                apps.push(InstalledApp {
                    package_name,
                    version_name,
                    version_code,
                    is_system,
                });
            }
        }
    }

    Ok(apps)
}

/// Helper to get app version name and code from dumpsys.
async fn get_app_version(
    app: &AppHandle,
    serial: &str,
    package_name: &str,
) -> (String, String) {
    let output = exec_device(
        app,
        serial,
        &["shell", "dumpsys", "package", package_name],
    )
    .await
    .unwrap_or_default();

    let mut version_name = String::new();
    let mut version_code = String::new();

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("versionName=") {
            version_name = trimmed
                .strip_prefix("versionName=")
                .unwrap_or("")
                .to_string();
        } else if trimmed.starts_with("versionCode=") {
            // versionCode=123 minSdk=... targetSdk=...
            version_code = trimmed
                .strip_prefix("versionCode=")
                .unwrap_or("")
                .split_whitespace()
                .next()
                .unwrap_or("")
                .to_string();
        }

        // Stop after finding both
        if !version_name.is_empty() && !version_code.is_empty() {
            break;
        }
    }

    (version_name, version_code)
}

/// Clear app data.
pub async fn clear_app_data(
    app: &AppHandle,
    serial: &str,
    package_name: &str,
) -> Result<String, String> {
    exec_device(app, serial, &["shell", "pm", "clear", package_name]).await
}

/// Force stop an app.
pub async fn force_stop_app(
    app: &AppHandle,
    serial: &str,
    package_name: &str,
) -> Result<String, String> {
    exec_device(app, serial, &["shell", "am", "force-stop", package_name]).await
}

/// Launch an app using monkey (sends LAUNCHER intent).
pub async fn launch_app(
    app: &AppHandle,
    serial: &str,
    package_name: &str,
) -> Result<String, String> {
    exec_device(
        app,
        serial,
        &[
            "shell",
            "monkey",
            "-p",
            package_name,
            "-c",
            "android.intent.category.LAUNCHER",
            "1",
        ],
    )
    .await
}

// ---------------------------------------------------------------------------
// Screenshot
// ---------------------------------------------------------------------------

/// Take a screenshot: screencap on device, pull to local, remove temp file.
pub async fn screenshot(
    app: &AppHandle,
    serial: &str,
    local_path: &str,
) -> Result<String, String> {
    let remote_temp = "/sdcard/screenshot_tmp.png";

    exec_device(app, serial, &["shell", "screencap", "-p", remote_temp]).await?;
    exec_device(app, serial, &["pull", remote_temp, local_path]).await?;
    // Clean up remote temp file (ignore errors)
    let _ = exec_device(app, serial, &["shell", "rm", remote_temp]).await;

    Ok(local_path.to_string())
}

// ---------------------------------------------------------------------------
// File operations
// ---------------------------------------------------------------------------

/// Push a local file to the device.
pub async fn push_file(
    app: &AppHandle,
    serial: &str,
    local_path: &str,
    remote_path: &str,
) -> Result<String, String> {
    exec_device(app, serial, &["push", local_path, remote_path]).await
}

/// Pull a file from the device to local.
pub async fn pull_file(
    app: &AppHandle,
    serial: &str,
    remote_path: &str,
    local_path: &str,
) -> Result<String, String> {
    exec_device(app, serial, &["pull", remote_path, local_path]).await
}

/// List files in a remote directory via `ls -la`.
pub async fn list_files(
    app: &AppHandle,
    serial: &str,
    remote_dir: &str,
) -> Result<Vec<String>, String> {
    let output = exec_device(app, serial, &["shell", "ls", "-la", remote_dir]).await?;
    let files: Vec<String> = output
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    Ok(files)
}

// ---------------------------------------------------------------------------
// Server management
// ---------------------------------------------------------------------------

/// Check adb server status / version.
pub async fn check_server(app: &AppHandle) -> Result<String, String> {
    exec(app, &["version"]).await
}

/// Kill the adb server.
pub async fn kill_server(app: &AppHandle) -> Result<String, String> {
    exec(app, &["kill-server"]).await
}

/// Start the adb server.
pub async fn start_server(app: &AppHandle) -> Result<String, String> {
    exec(app, &["start-server"]).await
}

// ---------------------------------------------------------------------------
// WiFi debugging
// ---------------------------------------------------------------------------

/// Connect to a device over WiFi (address should be ip:port).
pub async fn connect_wifi(app: &AppHandle, address: &str) -> Result<String, String> {
    exec(app, &["connect", address]).await
}

/// Disconnect a WiFi device.
pub async fn disconnect_wifi(app: &AppHandle, address: &str) -> Result<String, String> {
    exec(app, &["disconnect", address]).await
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Extract error code from adb install output.
/// Looks for pattern like "Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE]"
/// or "Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: ...]".
pub fn extract_error_code(output: &str) -> String {
    // Match "Failure [CODE]" or "Failure [CODE: detail]"
    if let Some(start) = output.find("Failure [") {
        let after = &output[start + 9..]; // skip "Failure ["
        if let Some(end) = after.find(']') {
            let code_section = &after[..end];
            // Handle "CODE: detail" format — take only the code part
            return code_section
                .split(':')
                .next()
                .unwrap_or(code_section)
                .trim()
                .to_string();
        }
    }
    "UNKNOWN_ERROR".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_error_code_simple() {
        let output = "Performing Streamed Install\nFailure [INSTALL_FAILED_UPDATE_INCOMPATIBLE]";
        assert_eq!(
            extract_error_code(output),
            "INSTALL_FAILED_UPDATE_INCOMPATIBLE"
        );
    }

    #[test]
    fn test_extract_error_code_with_detail() {
        let output = "Failure [INSTALL_FAILED_VERSION_DOWNGRADE: Package abc]";
        assert_eq!(
            extract_error_code(output),
            "INSTALL_FAILED_VERSION_DOWNGRADE"
        );
    }

    #[test]
    fn test_extract_error_code_no_match() {
        let output = "Success";
        assert_eq!(extract_error_code(output), "UNKNOWN_ERROR");
    }

    #[test]
    fn test_parse_df_output() {
        let df = "Filesystem     1K-blocks    Used Available Use% Mounted on\n/dev/block/dm-0 52428800 31457280 20971520  60% /data\n";
        let (total, free) = parse_df_output(df);
        assert_eq!(total, 52428800 / 1024);
        assert_eq!(free, 20971520 / 1024);
    }
}
