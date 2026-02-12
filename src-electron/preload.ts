import { contextBridge, ipcRenderer, webUtils } from "electron";

export interface ElectronAPI {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  onLogcatLine(
    serial: string,
    callback: (line: unknown) => void,
  ): () => void;
  showOpenDialog(
    options?: unknown,
  ): Promise<string | null>;
  showSaveDialog(
    options?: unknown,
  ): Promise<string | null>;
  convertFileSrc(path: string): string;
  getPathForFile(file: File): string;
  onUpdateProgress(callback: (progress: unknown) => void): () => void;
}

const api: ElectronAPI = {
  invoke(channel, ...args) {
    return ipcRenderer.invoke(channel, ...args);
  },

  onLogcatLine(serial, callback) {
    const eventName = `logcat-line-${serial}`;
    const handler = (_event: Electron.IpcRendererEvent, line: unknown) => {
      callback(line);
    };
    ipcRenderer.on(eventName, handler);
    return () => {
      ipcRenderer.removeListener(eventName, handler);
    };
  },

  showOpenDialog(options) {
    return ipcRenderer.invoke("show-open-dialog", options);
  },

  showSaveDialog(options) {
    return ipcRenderer.invoke("show-save-dialog", options);
  },

  convertFileSrc(path) {
    // Electron uses file:// protocol for local files
    return `file://${path}`;
  },

  getPathForFile(file) {
    return webUtils.getPathForFile(file);
  },

  onUpdateProgress(callback) {
    const handler = (
      _event: Electron.IpcRendererEvent,
      progress: unknown,
    ) => {
      callback(progress);
    };
    ipcRenderer.on("update-progress", handler);
    return () => {
      ipcRenderer.removeListener("update-progress", handler);
    };
  },
};

contextBridge.exposeInMainWorld("electronAPI", api);
