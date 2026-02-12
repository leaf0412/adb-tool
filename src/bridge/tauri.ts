import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type {
  AdbDevice,
  DeviceDetail,
  InstalledApp,
  InstallResult,
  LogcatLine,
  OpLogEntry,
} from "../types";
import type { Bridge, OpenDialogOptions, SaveDialogOptions } from "./types";

export const tauriBridge: Bridge = {
  getDevices() {
    return invoke<AdbDevice[]>("get_devices");
  },

  getDeviceDetail(serial) {
    return invoke<DeviceDetail>("get_device_detail", { serial });
  },

  connectWifi(address) {
    return invoke<string>("connect_wifi", { address });
  },

  disconnectWifi(address) {
    return invoke<string>("disconnect_wifi", { address });
  },

  killServer() {
    return invoke<string>("kill_server");
  },

  startServer() {
    return invoke<string>("start_server");
  },

  getPackages(serial, includeSystem) {
    return invoke<InstalledApp[]>("get_packages", { serial, includeSystem });
  },

  launchApp(serial, packageName) {
    return invoke<string>("launch_app", { serial, packageName });
  },

  forceStop(serial, packageName) {
    return invoke<string>("force_stop", { serial, packageName });
  },

  clearAppData(serial, packageName) {
    return invoke<string>("clear_app_data", { serial, packageName });
  },

  uninstallApp(serial, packageName) {
    return invoke<string>("uninstall_app", { serial, packageName });
  },

  installApk(serial, apkPath, flags) {
    return invoke<InstallResult>("install_apk", { serial, apkPath, flags });
  },

  listRemoteFiles(serial, remoteDir) {
    return invoke<string[]>("list_remote_files", { serial, remoteDir });
  },

  pushFile(serial, localPath, remotePath) {
    return invoke<string>("push_file", { serial, localPath, remotePath });
  },

  pullFile(serial, remotePath, localPath) {
    return invoke<string>("pull_file", { serial, remotePath, localPath });
  },

  deleteRemoteFile(serial, remotePath) {
    return invoke<string>("delete_remote_file", { serial, remotePath });
  },

  takeScreenshot(serial, localPath) {
    return invoke<string>("take_screenshot", { serial, localPath });
  },

  startLogcat(serial) {
    return invoke<number>("start_logcat", { serial });
  },

  async stopLogcat(serial) {
    await invoke("stop_logcat", { serial });
  },

  async onLogcatLine(serial, callback) {
    return listen<LogcatLine>(`logcat-line-${serial}`, (event) => {
      callback(event.payload);
    });
  },

  getOpLogs(opType, device) {
    return invoke<OpLogEntry[]>("get_op_logs", { opType, device });
  },

  async clearOpLogs() {
    await invoke("clear_op_logs");
  },

  async showOpenDialog(options?: OpenDialogOptions) {
    const result = await open({
      filters: options?.filters,
    });
    return typeof result === "string" ? result : null;
  },

  async showSaveDialog(options?: SaveDialogOptions) {
    const result = await save({
      defaultPath: options?.defaultPath,
      filters: options?.filters,
    });
    return result ?? null;
  },

  convertFileSrc(path) {
    return convertFileSrc(path);
  },

  async onDragDrop(callback) {
    const unlisten = await getCurrentWebviewWindow().onDragDropEvent(
      (event) => {
        callback({
          type: event.payload.type as "drop" | "over" | "leave",
          paths:
            event.payload.type === "drop"
              ? (event.payload as { type: "drop"; paths: string[] }).paths
              : [],
        });
      },
    );
    return unlisten;
  },

  async checkForUpdates() {
    return invoke<{ available: boolean; version: string; body: string }>(
      "check_for_updates",
    );
  },

  async downloadUpdate() {
    await invoke("download_and_install_update");
  },

  async installUpdate() {
    await invoke("restart_app");
  },

  async onUpdateProgress(callback) {
    return listen<{ percent: number; transferred: number; total: number }>(
      "update-progress",
      (event) => {
        callback(event.payload);
      },
    );
  },

  async getAppVersion() {
    return invoke<string>("get_app_version");
  },
};
