mod adb;
mod error_codes;
mod logcat;
mod op_log;

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
    let flag_refs: Vec<&str> = flags.iter().map(|s| s.as_str()).collect();
    let result = adb::install_apk(&app, &serial, &apk_path, &flag_refs).await?;
    let file_name = apk_path.rsplit('/').next().or_else(|| apk_path.rsplit('\\').next()).unwrap_or(&apk_path);
    op_log::add_entry(&state, op_log::OpLogEntry {
        timestamp: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        op_type: "install".to_string(),
        device: serial.clone(),
        detail: format!("安装 {}", file_name),
        success: result.success,
        error_message: result.error_message_cn.clone(),
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
    let (success, error_msg) = match &result {
        Ok(_) => (true, None),
        Err(e) => (false, Some(e.clone())),
    };
    op_log::add_entry(&state, op_log::OpLogEntry {
        timestamp: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        op_type: "uninstall".to_string(),
        device: serial.clone(),
        detail: format!("卸载 {}", package_name),
        success,
        error_message: error_msg,
        raw_output: None,
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
    let (success, error_msg) = match &result {
        Ok(_) => (true, None),
        Err(e) => (false, Some(e.clone())),
    };
    op_log::add_entry(&state, op_log::OpLogEntry {
        timestamp: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        op_type: "screenshot".to_string(),
        device: serial.clone(),
        detail: format!("截图 → {}", local_path),
        success,
        error_message: error_msg,
        raw_output: None,
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
    let (success, error_msg) = match &result {
        Ok(_) => (true, None),
        Err(e) => (false, Some(e.clone())),
    };
    op_log::add_entry(&state, op_log::OpLogEntry {
        timestamp: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        op_type: "upload".to_string(),
        device: serial.clone(),
        detail: format!("上传 {} → {}", file_name, remote_path),
        success,
        error_message: error_msg,
        raw_output: None,
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
    let (success, error_msg) = match &result {
        Ok(_) => (true, None),
        Err(e) => (false, Some(e.clone())),
    };
    op_log::add_entry(&state, op_log::OpLogEntry {
        timestamp: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        op_type: "download".to_string(),
        device: serial.clone(),
        detail: format!("下载 {} → {}", file_name, local_path),
        success,
        error_message: error_msg,
        raw_output: None,
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
            connect_wifi,
            disconnect_wifi,
            kill_server,
            start_server,
            start_logcat,
            stop_logcat,
            get_op_logs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
