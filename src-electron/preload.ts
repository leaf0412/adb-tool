import { contextBridge, ipcRenderer } from "electron";

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
};

contextBridge.exposeInMainWorld("electronAPI", api);
