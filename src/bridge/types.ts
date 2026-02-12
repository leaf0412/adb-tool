import type {
  AdbDevice,
  DeviceDetail,
  InstalledApp,
  InstallResult,
  LogcatLine,
  OpLogEntry,
} from "../types";

export type UnlistenFn = () => void;

export interface DialogFilter {
  name: string;
  extensions: string[];
}

export interface OpenDialogOptions {
  filters?: DialogFilter[];
}

export interface SaveDialogOptions {
  defaultPath?: string;
  filters?: DialogFilter[];
}

export interface DragDropPayload {
  type: "drop" | "over" | "leave";
  paths: string[];
}

export interface UpdateInfo {
  available: boolean;
  version: string;
  body: string;
}

export interface UpdateProgress {
  percent: number;
  transferred: number;
  total: number;
}

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "error";

export interface Bridge {
  getDevices(): Promise<AdbDevice[]>;
  getDeviceDetail(serial: string): Promise<DeviceDetail>;
  connectWifi(address: string): Promise<string>;
  disconnectWifi(address: string): Promise<string>;
  killServer(): Promise<string>;
  startServer(): Promise<string>;
  getPackages(serial: string, includeSystem: boolean): Promise<InstalledApp[]>;
  launchApp(serial: string, packageName: string): Promise<string>;
  forceStop(serial: string, packageName: string): Promise<string>;
  clearAppData(serial: string, packageName: string): Promise<string>;
  uninstallApp(serial: string, packageName: string): Promise<string>;
  installApk(
    serial: string,
    apkPath: string,
    flags: string[],
  ): Promise<InstallResult>;
  listRemoteFiles(serial: string, remoteDir: string): Promise<string[]>;
  pushFile(
    serial: string,
    localPath: string,
    remotePath: string,
  ): Promise<string>;
  pullFile(
    serial: string,
    remotePath: string,
    localPath: string,
  ): Promise<string>;
  takeScreenshot(serial: string, localPath: string): Promise<string>;
  startLogcat(serial: string): Promise<number>;
  stopLogcat(serial: string): Promise<void>;
  onLogcatLine(
    serial: string,
    callback: (line: LogcatLine) => void,
  ): Promise<UnlistenFn>;
  getOpLogs(
    opType: string | null,
    device: string | null,
  ): Promise<OpLogEntry[]>;
  clearOpLogs(): Promise<void>;
  showOpenDialog(options?: OpenDialogOptions): Promise<string | null>;
  showSaveDialog(options?: SaveDialogOptions): Promise<string | null>;
  convertFileSrc(path: string): string;
  onDragDrop(
    callback: (payload: DragDropPayload) => void,
  ): Promise<UnlistenFn>;
  checkForUpdates(): Promise<UpdateInfo>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  onUpdateProgress(
    callback: (progress: UpdateProgress) => void,
  ): Promise<UnlistenFn>;
  getAppVersion(): Promise<string>;
}
