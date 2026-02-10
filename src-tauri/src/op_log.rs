use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpLogEntry {
    pub timestamp: String,
    pub op_type: String, // "install", "uninstall", "screenshot", "upload", "download"
    pub device: String,
    pub detail: String,
    pub success: bool,
    pub error_message: Option<String>,
    pub raw_output: Option<String>,
}

pub struct OpLogState {
    pub entries: Mutex<Vec<OpLogEntry>>,
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

/// Returns `~/AdbTool/op_history.json`.
fn get_log_path() -> PathBuf {
    let home = dirs::home_dir().expect("cannot resolve home directory");
    home.join("AdbTool").join("op_history.json")
}

/// Read the JSON log file into a Vec. Returns an empty Vec on any I/O or
/// parse error so callers never need to handle a missing/corrupt file.
fn load_from_file() -> Result<Vec<OpLogEntry>, String> {
    let path = get_log_path();
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = fs::read_to_string(&path).map_err(|e| format!("read log file: {e}"))?;
    if data.trim().is_empty() {
        return Ok(Vec::new());
    }
    serde_json::from_str(&data).map_err(|e| format!("parse log file: {e}"))
}

/// Persist the full entry list back to disk (atomic-ish: write then overwrite).
fn save_to_file(entries: &[OpLogEntry]) -> Result<(), String> {
    let path = get_log_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create log dir: {e}"))?;
    }
    let json = serde_json::to_string_pretty(entries).map_err(|e| format!("serialize: {e}"))?;
    fs::write(&path, json).map_err(|e| format!("write log file: {e}"))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

impl OpLogState {
    /// Create state, pre-loading any existing entries from disk.
    pub fn new() -> Self {
        let entries = load_from_file().unwrap_or_default();
        Self {
            entries: Mutex::new(entries),
        }
    }
}

/// Append an entry and persist to disk.
pub fn add_entry(state: &OpLogState, entry: OpLogEntry) {
    let mut entries = state.entries.lock().expect("op_log lock poisoned");
    entries.push(entry);
    if let Err(e) = save_to_file(&entries) {
        eprintln!("[op_log] failed to save: {e}");
    }
}

/// Return entries, optionally filtered by `op_type` and/or `device`.
pub fn get_entries(
    state: &OpLogState,
    op_type: Option<&str>,
    device: Option<&str>,
) -> Vec<OpLogEntry> {
    let entries = state.entries.lock().expect("op_log lock poisoned");
    entries
        .iter()
        .filter(|e| op_type.map_or(true, |t| e.op_type == t))
        .filter(|e| device.map_or(true, |d| e.device == d))
        .cloned()
        .collect()
}
