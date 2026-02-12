mod adb;
mod apk_parser;
mod error_codes;
mod logcat;
mod op_log;

use tauri::Emitter;
use tauri_plugin_updater::UpdaterExt;

// ---------------------------------------------------------------------------
// Tauri commands — thin wrappers around adb module functions
// ---------------------------------------------------------------------------

#[tauri::command]
async fn adb_version(app: tauri::AppHandle) -> Result<String, String> {
    adb::check_server(&app).await
}

#[tauri::command]
async fn get_devices(app: tauri::AppHandle) -> Result<Vec<adb::AdbDevice>, String> {
    adb::list_devices(&app).await
}

#[tauri::command]
async fn get_device_detail(
    app: tauri::AppHandle,
    serial: String,
) -> Result<adb::DeviceDetail, String> {
    adb::get_device_detail(&app, &serial).await
}

#[tauri::command]
async fn install_apk(
    app: tauri::AppHandle,
    state: tauri::State<'_, op_log::OpLogState>,
    serial: String,
    apk_path: String,
    flags: Vec<String>,
) -> Result<adb::InstallResult, String> {
    // Uninstall existing app before install to avoid signature conflicts
    if let Ok(package_name) = apk_parser::extract_package_name(&apk_path) {
        let _ = adb::uninstall_app(&app, &serial, &package_name).await;
    }

    let flag_refs: Vec<&str> = flags.iter().map(|s| s.as_str()).collect();
    let result = adb::install_apk(&app, &serial, &apk_path, &flag_refs).await?;
    let file_name = apk_path.rsplit('/').next().or_else(|| apk_path.rsplit('\\').next()).unwrap_or(&apk_path);
    let cmd = if flags.is_empty() {
        format!("adb -s {} install {}", serial, file_name)
    } else {
        format!("adb -s {} install {} {}", serial, flags.join(" "), file_name)
    };
    op_log::add_entry(&state, op_log::OpLogEntry {
        timestamp: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        op_type: "install".to_string(),
        device: serial.clone(),
        detail: format!("安装 {}", file_name),
        success: result.success,
        error_message: result.error_message_cn.clone(),
        command: Some(cmd),
        raw_output: Some(result.raw_output.clone()),
    });
    Ok(result)
}

#[tauri::command]
async fn uninstall_app(
    app: tauri::AppHandle,
    state: tauri::State<'_, op_log::OpLogState>,
    serial: String,
    package_name: String,
) -> Result<String, String> {
    let result = adb::uninstall_app(&app, &serial, &package_name).await;
    let (success, error_msg, raw) = match &result {
        Ok(output) => (true, None, output.clone()),
        Err(e) => (false, Some(e.clone()), e.clone()),
    };
    op_log::add_entry(&state, op_log::OpLogEntry {
        timestamp: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        op_type: "uninstall".to_string(),
        device: serial.clone(),
        detail: format!("卸载 {}", package_name),
        success,
        error_message: error_msg,
        command: Some(format!("adb -s {} uninstall {}", serial, package_name)),
        raw_output: Some(raw),
    });
    result
}

#[tauri::command]
async fn get_packages(
    app: tauri::AppHandle,
    serial: String,
    include_system: bool,
) -> Result<Vec<adb::InstalledApp>, String> {
    adb::list_packages(&app, &serial, include_system).await
}

#[tauri::command]
async fn clear_app_data(
    app: tauri::AppHandle,
    serial: String,
    package_name: String,
) -> Result<String, String> {
    adb::clear_app_data(&app, &serial, &package_name).await
}

#[tauri::command]
async fn force_stop(
    app: tauri::AppHandle,
    serial: String,
    package_name: String,
) -> Result<String, String> {
    adb::force_stop_app(&app, &serial, &package_name).await
}

#[tauri::command]
async fn launch_app(
    app: tauri::AppHandle,
    serial: String,
    package_name: String,
) -> Result<String, String> {
    adb::launch_app(&app, &serial, &package_name).await
}

#[tauri::command]
async fn take_screenshot(
    app: tauri::AppHandle,
    state: tauri::State<'_, op_log::OpLogState>,
    serial: String,
    local_path: String,
) -> Result<String, String> {
    let result = adb::screenshot(&app, &serial, &local_path).await;
    let (success, error_msg, raw) = match &result {
        Ok(path) => (true, None, format!("保存至 {}", path)),
        Err(e) => (false, Some(e.clone()), e.clone()),
    };
    op_log::add_entry(&state, op_log::OpLogEntry {
        timestamp: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        op_type: "screenshot".to_string(),
        device: serial.clone(),
        detail: format!("截图 → {}", local_path),
        success,
        error_message: error_msg,
        command: Some(format!("adb -s {} exec-out screencap -p > {}", serial, local_path)),
        raw_output: Some(raw),
    });
    result
}

#[tauri::command]
async fn push_file(
    app: tauri::AppHandle,
    state: tauri::State<'_, op_log::OpLogState>,
    serial: String,
    local_path: String,
    remote_path: String,
) -> Result<String, String> {
    let result = adb::push_file(&app, &serial, &local_path, &remote_path).await;
    let file_name = local_path.rsplit('/').next().or_else(|| local_path.rsplit('\\').next()).unwrap_or(&local_path);
    let (success, error_msg, raw) = match &result {
        Ok(output) => (true, None, output.clone()),
        Err(e) => (false, Some(e.clone()), e.clone()),
    };
    op_log::add_entry(&state, op_log::OpLogEntry {
        timestamp: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        op_type: "upload".to_string(),
        device: serial.clone(),
        detail: format!("上传 {} → {}", file_name, remote_path),
        success,
        error_message: error_msg,
        command: Some(format!("adb -s {} push {} {}", serial, local_path, remote_path)),
        raw_output: Some(raw),
    });
    result
}

#[tauri::command]
async fn pull_file(
    app: tauri::AppHandle,
    state: tauri::State<'_, op_log::OpLogState>,
    serial: String,
    remote_path: String,
    local_path: String,
) -> Result<String, String> {
    let result = adb::pull_file(&app, &serial, &remote_path, &local_path).await;
    let file_name = remote_path.rsplit('/').next().unwrap_or(&remote_path);
    let (success, error_msg, raw) = match &result {
        Ok(output) => (true, None, output.clone()),
        Err(e) => (false, Some(e.clone()), e.clone()),
    };
    op_log::add_entry(&state, op_log::OpLogEntry {
        timestamp: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        op_type: "download".to_string(),
        device: serial.clone(),
        detail: format!("下载 {} → {}", file_name, local_path),
        success,
        error_message: error_msg,
        command: Some(format!("adb -s {} pull {} {}", serial, remote_path, local_path)),
        raw_output: Some(raw),
    });
    result
}

#[tauri::command]
async fn list_remote_files(
    app: tauri::AppHandle,
    serial: String,
    remote_dir: String,
) -> Result<Vec<String>, String> {
    adb::list_files(&app, &serial, &remote_dir).await
}

#[tauri::command]
async fn delete_remote_file(
    app: tauri::AppHandle,
    serial: String,
    remote_path: String,
) -> Result<String, String> {
    adb::delete_file(&app, &serial, &remote_path).await
}

#[tauri::command]
async fn connect_wifi(
    app: tauri::AppHandle,
    address: String,
) -> Result<String, String> {
    adb::connect_wifi(&app, &address).await
}

#[tauri::command]
async fn disconnect_wifi(
    app: tauri::AppHandle,
    address: String,
) -> Result<String, String> {
    adb::disconnect_wifi(&app, &address).await
}

#[tauri::command]
async fn kill_server(app: tauri::AppHandle) -> Result<String, String> {
    adb::kill_server(&app).await
}

#[tauri::command]
async fn start_server(app: tauri::AppHandle) -> Result<String, String> {
    adb::start_server(&app).await
}

#[tauri::command]
async fn start_logcat(app: tauri::AppHandle, serial: String) -> Result<u32, String> {
    logcat::start_stream(&app, &serial).await
}

#[tauri::command]
async fn stop_logcat(app: tauri::AppHandle, serial: String) -> Result<(), String> {
    logcat::stop_stream(&app, &serial).await
}

#[tauri::command]
fn get_op_logs(
    state: tauri::State<'_, op_log::OpLogState>,
    op_type: Option<String>,
    device: Option<String>,
) -> Vec<op_log::OpLogEntry> {
    op_log::get_entries(&state, op_type.as_deref(), device.as_deref())
}

#[tauri::command]
fn clear_op_logs(state: tauri::State<'_, op_log::OpLogState>) -> Result<(), String> {
    op_log::clear_entries(&state)
}

#[tauri::command]
async fn check_for_updates(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let updater = app
        .updater_builder()
        .build()
        .map_err(|e| e.to_string())?;

    match updater.check().await {
        Ok(Some(update)) => Ok(serde_json::json!({
            "available": true,
            "version": update.version,
            "body": update.body.unwrap_or_default(),
        })),
        Ok(None) => Ok(serde_json::json!({
            "available": false,
            "version": "",
            "body": "",
        })),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn download_and_install_update(app: tauri::AppHandle) -> Result<(), String> {
    let updater = app
        .updater_builder()
        .build()
        .map_err(|e| e.to_string())?;

    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No update available".to_string())?;

    let mut downloaded: u64 = 0;

    update
        .download_and_install(
            |chunk_len, content_length| {
                downloaded += chunk_len as u64;
                let total = content_length.unwrap_or(0);
                let percent = if total > 0 {
                    (downloaded as f64 / total as f64) * 100.0
                } else {
                    0.0
                };
                let _ = app.emit("update-progress", serde_json::json!({
                    "percent": percent,
                    "transferred": downloaded,
                    "total": total,
                }));
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn get_app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

// ---------------------------------------------------------------------------
// App entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logcat::cleanup_old_logs();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(logcat::LogcatState::new())
        .manage(op_log::OpLogState::new())
        .invoke_handler(tauri::generate_handler![
            adb_version,
            get_devices,
            get_device_detail,
            install_apk,
            uninstall_app,
            get_packages,
            clear_app_data,
            force_stop,
            launch_app,
            take_screenshot,
            push_file,
            pull_file,
            list_remote_files,
            delete_remote_file,
            connect_wifi,
            disconnect_wifi,
            kill_server,
            start_server,
            start_logcat,
            stop_logcat,
            get_op_logs,
            clear_op_logs,
            check_for_updates,
            download_and_install_update,
            get_app_version,
            restart_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
