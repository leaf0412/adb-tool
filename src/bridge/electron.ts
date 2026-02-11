import type {
  AdbDevice,
  DeviceDetail,
  InstalledApp,
  InstallResult,
  LogcatLine,
  OpLogEntry,
} from "../types";
import type {
  Bridge,
  OpenDialogOptions,
  SaveDialogOptions,
  UnlistenFn,
} from "./types";

interface ElectronAPI {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  onLogcatLine(serial: string, callback: (line: unknown) => void): () => void;
  showOpenDialog(options?: unknown): Promise<string | null>;
  showSaveDialog(options?: unknown): Promise<string | null>;
  convertFileSrc(path: string): string;
  getPathForFile(file: File): string;
}

function getAPI(): ElectronAPI {
  return (window as unknown as { electronAPI: ElectronAPI }).electronAPI;
}

export const electronBridge: Bridge = {
  async getDevices() {
    return (await getAPI().invoke("get-devices")) as AdbDevice[];
  },

  async getDeviceDetail(serial) {
    return (await getAPI().invoke(
      "get-device-detail",
      serial,
    )) as DeviceDetail;
  },

  async connectWifi(address) {
    return (await getAPI().invoke("connect-wifi", address)) as string;
  },

  async disconnectWifi(address) {
    return (await getAPI().invoke("disconnect-wifi", address)) as string;
  },

  async killServer() {
    return (await getAPI().invoke("kill-server")) as string;
  },

  async startServer() {
    return (await getAPI().invoke("start-server")) as string;
  },

  async getPackages(serial, includeSystem) {
    return (await getAPI().invoke(
      "get-packages",
      serial,
      includeSystem,
    )) as InstalledApp[];
  },

  async launchApp(serial, packageName) {
    return (await getAPI().invoke(
      "launch-app",
      serial,
      packageName,
    )) as string;
  },

  async forceStop(serial, packageName) {
    return (await getAPI().invoke(
      "force-stop",
      serial,
      packageName,
    )) as string;
  },

  async clearAppData(serial, packageName) {
    return (await getAPI().invoke(
      "clear-app-data",
      serial,
      packageName,
    )) as string;
  },

  async uninstallApp(serial, packageName) {
    return (await getAPI().invoke(
      "uninstall-app",
      serial,
      packageName,
    )) as string;
  },

  async installApk(serial, apkPath, flags) {
    return (await getAPI().invoke(
      "install-apk",
      serial,
      apkPath,
      flags,
    )) as InstallResult;
  },

  async listRemoteFiles(serial, remoteDir) {
    return (await getAPI().invoke(
      "list-remote-files",
      serial,
      remoteDir,
    )) as string[];
  },

  async pushFile(serial, localPath, remotePath) {
    return (await getAPI().invoke(
      "push-file",
      serial,
      localPath,
      remotePath,
    )) as string;
  },

  async pullFile(serial, remotePath, localPath) {
    return (await getAPI().invoke(
      "pull-file",
      serial,
      remotePath,
      localPath,
    )) as string;
  },

  async takeScreenshot(serial, localPath) {
    return (await getAPI().invoke(
      "take-screenshot",
      serial,
      localPath,
    )) as string;
  },

  async startLogcat(serial) {
    return (await getAPI().invoke("start-logcat", serial)) as number;
  },

  async stopLogcat(serial) {
    await getAPI().invoke("stop-logcat", serial);
  },

  async onLogcatLine(serial, callback) {
    const unlisten = getAPI().onLogcatLine(serial, (line) => {
      callback(line as LogcatLine);
    });
    return unlisten;
  },

  async getOpLogs(opType, device) {
    return (await getAPI().invoke(
      "get-op-logs",
      opType,
      device,
    )) as OpLogEntry[];
  },

  async clearOpLogs() {
    await getAPI().invoke("clear-op-logs");
  },

  async showOpenDialog(options?: OpenDialogOptions) {
    return getAPI().showOpenDialog(options);
  },

  async showSaveDialog(options?: SaveDialogOptions) {
    return getAPI().showSaveDialog(options);
  },

  convertFileSrc(path) {
    return getAPI().convertFileSrc(path);
  },

  async onDragDrop(callback): Promise<UnlistenFn> {
    // Electron uses DOM drag-drop events with File.path for native file paths
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      callback({ type: "over", paths: [] });
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      callback({ type: "leave", paths: [] });
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const paths: string[] = [];
      if (e.dataTransfer?.files) {
        const api = getAPI();
        for (const file of Array.from(e.dataTransfer.files)) {
          const filePath = api.getPathForFile(file);
          if (filePath) paths.push(filePath);
        }
      }
      callback({ type: "drop", paths });
    };

    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("dragleave", handleDragLeave);
    document.addEventListener("drop", handleDrop);

    return () => {
      document.removeEventListener("dragover", handleDragOver);
      document.removeEventListener("dragleave", handleDragLeave);
      document.removeEventListener("drop", handleDrop);
    };
  },
};
