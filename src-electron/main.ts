import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { join } from "node:path";
import * as adb from "./adb";
import { extractPackageName } from "./apk-parser";
import * as opLog from "./op-log";
import * as logcat from "./logcat";
import type { OpLogEntry } from "../src/types";
import pkg from "electron-updater";
const { autoUpdater } = pkg;

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // In dev, load from vite dev server; in prod, load built renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// -------------------------------------------------------------------------
// IPC handlers
// -------------------------------------------------------------------------

function nowTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function registerIpcHandlers(): void {
  // Device management
  ipcMain.handle("get-devices", () => adb.listDevices());
  ipcMain.handle("get-device-detail", (_e, serial: string) =>
    adb.getDeviceDetail(serial),
  );
  ipcMain.handle("connect-wifi", (_e, address: string) =>
    adb.connectWifi(address),
  );
  ipcMain.handle("disconnect-wifi", (_e, address: string) =>
    adb.disconnectWifi(address),
  );
  ipcMain.handle("kill-server", () => adb.killServer());
  ipcMain.handle("start-server", () => adb.startServer());

  // App management
  ipcMain.handle(
    "get-packages",
    (_e, serial: string, includeSystem: boolean) =>
      adb.listPackages(serial, includeSystem),
  );
  ipcMain.handle("launch-app", (_e, serial: string, packageName: string) =>
    adb.launchApp(serial, packageName),
  );
  ipcMain.handle("force-stop", (_e, serial: string, packageName: string) =>
    adb.forceStopApp(serial, packageName),
  );
  ipcMain.handle(
    "clear-app-data",
    (_e, serial: string, packageName: string) =>
      adb.clearAppData(serial, packageName),
  );

  // Uninstall with op-log
  ipcMain.handle(
    "uninstall-app",
    async (_e, serial: string, packageName: string) => {
      const result = adb.uninstallApp(serial, packageName);
      const [success, errorMsg, raw] = await result.then(
        (output) => [true, null, output] as const,
        (err) => [false, String(err), String(err)] as const,
      );
      const entry: OpLogEntry = {
        timestamp: nowTimestamp(),
        op_type: "uninstall",
        device: serial,
        detail: `卸载 ${packageName}`,
        success,
        error_message: errorMsg,
        command: `adb -s ${serial} uninstall ${packageName}`,
        raw_output: raw,
      };
      opLog.addEntry(entry);
      if (!success) throw new Error(raw);
      return raw;
    },
  );

  // Install APK with op-log (uninstall existing app first)
  ipcMain.handle(
    "install-apk",
    async (_e, serial: string, apkPath: string, flags: string[]) => {
      // Uninstall existing app before install to avoid signature conflicts
      const packageName = extractPackageName(apkPath);
      if (packageName) {
        try { await adb.uninstallApp(serial, packageName); } catch { /* ignore */ }
      }

      const result = await adb.installApk(serial, apkPath, flags);
      const fileName =
        apkPath.split("/").pop() || apkPath.split("\\").pop() || apkPath;
      const cmd = flags.length
        ? `adb -s ${serial} install ${flags.join(" ")} ${fileName}`
        : `adb -s ${serial} install ${fileName}`;
      const entry: OpLogEntry = {
        timestamp: nowTimestamp(),
        op_type: "install",
        device: serial,
        detail: `安装 ${fileName}`,
        success: result.success,
        error_message: result.error_message_cn,
        command: cmd,
        raw_output: result.raw_output,
      };
      opLog.addEntry(entry);
      return result;
    },
  );

  // File operations
  ipcMain.handle(
    "list-remote-files",
    (_e, serial: string, remoteDir: string) =>
      adb.listFiles(serial, remoteDir),
  );

  ipcMain.handle(
    "push-file",
    async (_e, serial: string, localPath: string, remotePath: string) => {
      const result = adb.pushFile(serial, localPath, remotePath);
      const fileName =
        localPath.split("/").pop() ||
        localPath.split("\\").pop() ||
        localPath;
      const [success, errorMsg, raw] = await result.then(
        (output) => [true, null, output] as const,
        (err) => [false, String(err), String(err)] as const,
      );
      const entry: OpLogEntry = {
        timestamp: nowTimestamp(),
        op_type: "upload",
        device: serial,
        detail: `上传 ${fileName} → ${remotePath}`,
        success,
        error_message: errorMsg,
        command: `adb -s ${serial} push ${localPath} ${remotePath}`,
        raw_output: raw,
      };
      opLog.addEntry(entry);
      if (!success) throw new Error(raw);
      return raw;
    },
  );

  ipcMain.handle(
    "pull-file",
    async (_e, serial: string, remotePath: string, localPath: string) => {
      const result = adb.pullFile(serial, remotePath, localPath);
      const fileName =
        remotePath.split("/").pop() || remotePath;
      const [success, errorMsg, raw] = await result.then(
        (output) => [true, null, output] as const,
        (err) => [false, String(err), String(err)] as const,
      );
      const entry: OpLogEntry = {
        timestamp: nowTimestamp(),
        op_type: "download",
        device: serial,
        detail: `下载 ${fileName} → ${localPath}`,
        success,
        error_message: errorMsg,
        command: `adb -s ${serial} pull ${remotePath} ${localPath}`,
        raw_output: raw,
      };
      opLog.addEntry(entry);
      if (!success) throw new Error(raw);
      return raw;
    },
  );

  // Screenshot with op-log
  ipcMain.handle(
    "take-screenshot",
    async (_e, serial: string, localPath: string) => {
      const result = adb.screenshot(serial, localPath);
      const [success, errorMsg, raw] = await result.then(
        (path) => [true, null, `保存至 ${path}`] as const,
        (err) => [false, String(err), String(err)] as const,
      );
      const entry: OpLogEntry = {
        timestamp: nowTimestamp(),
        op_type: "screenshot",
        device: serial,
        detail: `截图 → ${localPath}`,
        success,
        error_message: errorMsg,
        command: `adb -s ${serial} exec-out screencap -p > ${localPath}`,
        raw_output: raw,
      };
      opLog.addEntry(entry);
      if (!success) throw new Error(raw);
      return localPath;
    },
  );

  // Logcat
  ipcMain.handle("start-logcat", (_e, serial: string) => {
    if (!mainWindow) throw new Error("No main window");
    return logcat.startStream(serial, mainWindow);
  });
  ipcMain.handle("stop-logcat", (_e, serial: string) => {
    logcat.stopStream(serial);
  });

  // Op logs
  ipcMain.handle(
    "get-op-logs",
    (_e, opType: string | null, device: string | null) =>
      opLog.getEntries(opType, device),
  );
  ipcMain.handle("clear-op-logs", () => {
    opLog.clearEntries();
  });

  // Dialog handlers
  ipcMain.handle(
    "show-open-dialog",
    async (_e, options?: { filters?: Electron.FileFilter[] }) => {
      if (!mainWindow) return null;
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ["openFile"],
        filters: options?.filters,
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0];
    },
  );
  ipcMain.handle(
    "show-save-dialog",
    async (
      _e,
      options?: {
        defaultPath?: string;
        filters?: Electron.FileFilter[];
      },
    ) => {
      if (!mainWindow) return null;
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: options?.defaultPath,
        filters: options?.filters,
      });
      if (result.canceled || !result.filePath) return null;
      return result.filePath;
    },
  );

  // Auto-update handlers
  ipcMain.handle("check-for-updates", async () => {
    const result = await autoUpdater.checkForUpdates();
    if (!result || !result.updateInfo) {
      return { available: false, version: "", body: "" };
    }
    const { updateInfo } = result;
    const currentVersion = app.getVersion();
    const latestVersion = updateInfo.version;
    // Compare versions: split into parts and check if latest is newer
    const current = currentVersion.split(".").map(Number);
    const latest = latestVersion.split(".").map(Number);
    let available = false;
    for (let i = 0; i < Math.max(current.length, latest.length); i++) {
      const c = current[i] ?? 0;
      const l = latest[i] ?? 0;
      if (l > c) { available = true; break; }
      if (l < c) { break; }
    }
    let body = "";
    if (typeof updateInfo.releaseNotes === "string") {
      body = updateInfo.releaseNotes;
    } else if (Array.isArray(updateInfo.releaseNotes)) {
      body = updateInfo.releaseNotes.map((n) => n.note).join("\n");
    }
    return { available, version: latestVersion, body };
  });

  ipcMain.handle("download-update", async () => {
    await autoUpdater.downloadUpdate();
  });

  ipcMain.handle("install-update", () => {
    autoUpdater.quitAndInstall();
  });

  ipcMain.handle("get-app-version", () => {
    return app.getVersion();
  });
}

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("download-progress", (progress) => {
    mainWindow?.webContents.send("update-progress", {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    });
  });
}

// -------------------------------------------------------------------------
// App lifecycle
// -------------------------------------------------------------------------

app.whenReady().then(() => {
  logcat.cleanupOldLogs();
  opLog.initOpLog();
  registerIpcHandlers();
  setupAutoUpdater();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  logcat.stopAllStreams();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
