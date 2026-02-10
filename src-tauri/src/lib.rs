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
    serial: String,
    apk_path: String,
    flags: Vec<String>,
) -> Result<adb::InstallResult, String> {
    let flag_refs: Vec<&str> = flags.iter().map(|s| s.as_str()).collect();
    adb::install_apk(&app, &serial, &apk_path, &flag_refs).await
}

#[tauri::command]
async fn uninstall_app(
    app: tauri::AppHandle,
    serial: String,
    package_name: String,
) -> Result<String, String> {
    adb::uninstall_app(&app, &serial, &package_name).await
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
    serial: String,
    local_path: String,
) -> Result<String, String> {
    adb::screenshot(&app, &serial, &local_path).await
}

#[tauri::command]
async fn push_file(
    app: tauri::AppHandle,
    serial: String,
    local_path: String,
    remote_path: String,
) -> Result<String, String> {
    adb::push_file(&app, &serial, &local_path, &remote_path).await
}

#[tauri::command]
async fn pull_file(
    app: tauri::AppHandle,
    serial: String,
    remote_path: String,
    local_path: String,
) -> Result<String, String> {
    adb::pull_file(&app, &serial, &remote_path, &local_path).await
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
