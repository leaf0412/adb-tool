import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { translateError } from "./error-codes";
import type {
  AdbDevice,
  DeviceDetail,
  InstalledApp,
  InstallResult,
} from "../src/types";

const execFileAsync = promisify(execFile);

// -------------------------------------------------------------------------
// ADB path resolution
// -------------------------------------------------------------------------

let cachedAdbPath: string | null = null;

export function getAdbPath(): string {
  if (cachedAdbPath) return cachedAdbPath;

  const platform =
    process.platform === "win32"
      ? "windows"
      : process.platform === "darwin"
        ? "darwin"
        : "linux";
  const ext = process.platform === "win32" ? ".exe" : "";
  const binary = `adb${ext}`;

  // 1) Packaged app: process.resourcesPath/adb-bin/{platform}/adb
  if (app.isPackaged) {
    const packaged = join(process.resourcesPath, "adb-bin", platform, binary);
    if (existsSync(packaged)) {
      cachedAdbPath = packaged;
      return cachedAdbPath;
    }
  }

  // 2) Dev mode: project root adb-bin/{platform}/adb
  const devPath = join(app.getAppPath(), "adb-bin", platform, binary);
  if (existsSync(devPath)) {
    cachedAdbPath = devPath;
    return cachedAdbPath;
  }

  // 3) System PATH fallback
  cachedAdbPath = "adb";
  return cachedAdbPath;
}

// -------------------------------------------------------------------------
// Core executors
// -------------------------------------------------------------------------

export async function exec(args: string[]): Promise<string> {
  const adb = getAdbPath();
  try {
    const { stdout, stderr } = await execFileAsync(adb, args, {
      maxBuffer: 50 * 1024 * 1024,
    });
    if (stdout.trim() === "" && stderr.trim() !== "") {
      // Only fail if no useful stdout and stderr has content
      throw new Error(stderr.trim());
    }
    return stdout;
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message: string };
    // execFile rejects on non-zero exit, but adb install returns 0 on failure
    // so we try to return stdout if available
    if (e.stdout && e.stdout.trim()) {
      return e.stdout;
    }
    throw new Error(`adb error: ${e.stderr?.trim() || e.message}`);
  }
}

export async function execDevice(
  serial: string,
  args: string[],
): Promise<string> {
  return exec(["-s", serial, ...args]);
}

// -------------------------------------------------------------------------
// Device management
// -------------------------------------------------------------------------

export async function listDevices(): Promise<AdbDevice[]> {
  const output = await exec(["devices", "-l"]);
  const devices: AdbDevice[] = [];

  for (const line of output.split("\n").slice(1)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;

    const serial = parts[0];
    const state = parts[1];
    let model = "";
    let product = "";

    for (const part of parts.slice(2)) {
      if (part.startsWith("model:")) model = part.slice(6);
      else if (part.startsWith("product:")) product = part.slice(8);
    }

    devices.push({ serial, state, model, product });
  }

  return devices;
}

export async function getDeviceDetail(
  serial: string,
): Promise<DeviceDetail> {
  const [model, androidVersion, sdkVersion, dfOutput] = await Promise.all([
    execDevice(serial, ["shell", "getprop", "ro.product.model"]).catch(
      () => "",
    ),
    execDevice(serial, [
      "shell",
      "getprop",
      "ro.build.version.release",
    ]).catch(() => ""),
    execDevice(serial, ["shell", "getprop", "ro.build.version.sdk"]).catch(
      () => "",
    ),
    execDevice(serial, ["shell", "df", "/data"]).catch(() => ""),
  ]);

  const [storageTotalMb, storageFreeMb] = parseDfOutput(dfOutput);

  return {
    serial,
    model: model.trim(),
    android_version: androidVersion.trim(),
    sdk_version: sdkVersion.trim(),
    storage_total_mb: storageTotalMb,
    storage_free_mb: storageFreeMb,
  };
}

export function parseDfOutput(output: string): [number, number] {
  const lines = output.split("\n").slice(1);
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 4) {
      const totalKb = parseInt(parts[1].replace("K", ""), 10) || 0;
      const freeKb = parseInt(parts[3].replace("K", ""), 10) || 0;
      return [Math.floor(totalKb / 1024), Math.floor(freeKb / 1024)];
    }
  }
  return [0, 0];
}

// -------------------------------------------------------------------------
// App installation / management
// -------------------------------------------------------------------------

export async function installApk(
  serial: string,
  apkPath: string,
  flags: string[],
): Promise<InstallResult> {
  const adb = getAdbPath();
  const args = ["-s", serial, "install", ...flags, apkPath];

  let rawOutput: string;
  try {
    const { stdout, stderr } = await execFileAsync(adb, args, {
      maxBuffer: 50 * 1024 * 1024,
    });
    rawOutput = `${stdout.trim()}\n${stderr.trim()}`.trim();
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message: string };
    rawOutput =
      `${(e.stdout || "").trim()}\n${(e.stderr || "").trim()}`.trim() ||
      e.message;
  }

  if (rawOutput.includes("Success")) {
    return {
      success: true,
      error_code: null,
      error_message_cn: null,
      suggestion: null,
      auto_fix: null,
      raw_output: rawOutput,
    };
  }

  const errorCode = extractErrorCode(rawOutput);
  const translation = translateError(errorCode);

  return {
    success: false,
    error_code: errorCode,
    error_message_cn: translation.messageCn,
    suggestion: translation.suggestion,
    auto_fix: translation.autoFix,
    raw_output: rawOutput,
  };
}

export async function uninstallApp(
  serial: string,
  packageName: string,
): Promise<string> {
  return execDevice(serial, ["uninstall", packageName]);
}

export async function listPackages(
  serial: string,
  includeSystem: boolean,
): Promise<InstalledApp[]> {
  const args = includeSystem
    ? ["shell", "pm", "list", "packages", "-f"]
    : ["shell", "pm", "list", "packages", "-3", "-f"];

  const output = await execDevice(serial, args);
  const apps: InstalledApp[] = [];

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("package:")) continue;

    const rest = trimmed.slice(8); // remove "package:"
    const eqPos = rest.lastIndexOf("=");
    if (eqPos === -1) continue;

    const packageName = rest.slice(eqPos + 1);
    const apkPath = rest.slice(0, eqPos);
    const isSystem = apkPath.startsWith("/system");

    const { versionName, versionCode } = await getAppVersion(
      serial,
      packageName,
    );

    apps.push({
      package_name: packageName,
      version_name: versionName,
      version_code: versionCode,
      is_system: isSystem,
    });
  }

  return apps;
}

async function getAppVersion(
  serial: string,
  packageName: string,
): Promise<{ versionName: string; versionCode: string }> {
  let versionName = "";
  let versionCode = "";

  try {
    const output = await execDevice(serial, [
      "shell",
      "dumpsys",
      "package",
      packageName,
    ]);

    for (const line of output.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("versionName=") && !versionName) {
        versionName = trimmed.slice(12);
      } else if (trimmed.startsWith("versionCode=") && !versionCode) {
        versionCode = trimmed.slice(12).split(/\s/)[0];
      }
      if (versionName && versionCode) break;
    }
  } catch {
    // ignore errors getting version info
  }

  return { versionName, versionCode };
}

export async function clearAppData(
  serial: string,
  packageName: string,
): Promise<string> {
  return execDevice(serial, ["shell", "pm", "clear", packageName]);
}

export async function forceStopApp(
  serial: string,
  packageName: string,
): Promise<string> {
  return execDevice(serial, ["shell", "am", "force-stop", packageName]);
}

export async function launchApp(
  serial: string,
  packageName: string,
): Promise<string> {
  return execDevice(serial, [
    "shell",
    "monkey",
    "-p",
    packageName,
    "-c",
    "android.intent.category.LAUNCHER",
    "1",
  ]);
}

// -------------------------------------------------------------------------
// Screenshot
// -------------------------------------------------------------------------

export async function screenshot(
  serial: string,
  localPath: string,
): Promise<string> {
  const adb = getAdbPath();
  const { stdout, stderr } = await execFileAsync(
    adb,
    ["-s", serial, "exec-out", "screencap", "-p"],
    { encoding: "buffer", maxBuffer: 50 * 1024 * 1024 },
  );

  const data = stdout as unknown as Buffer;

  if (!data || data.length === 0) {
    const stderrStr =
      stderr instanceof Buffer ? stderr.toString() : String(stderr);
    throw new Error(`截图失败：screencap 返回空数据 ${stderrStr}`);
  }

  // Verify PNG signature
  if (
    data.length < 8 ||
    data[0] !== 0x89 ||
    data[1] !== 0x50 ||
    data[2] !== 0x4e ||
    data[3] !== 0x47
  ) {
    throw new Error("截图失败：返回数据不是有效的 PNG 格式");
  }

  await writeFile(localPath, data);
  return localPath;
}

// -------------------------------------------------------------------------
// File operations
// -------------------------------------------------------------------------

export async function pushFile(
  serial: string,
  localPath: string,
  remotePath: string,
): Promise<string> {
  return execDevice(serial, ["push", localPath, remotePath]);
}

export async function pullFile(
  serial: string,
  remotePath: string,
  localPath: string,
): Promise<string> {
  return execDevice(serial, ["pull", remotePath, localPath]);
}

export async function listFiles(
  serial: string,
  remoteDir: string,
): Promise<string[]> {
  const output = await execDevice(serial, ["shell", "ls", "-la", remoteDir]);
  return output
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

// -------------------------------------------------------------------------
// Server management
// -------------------------------------------------------------------------

export async function killServer(): Promise<string> {
  return exec(["kill-server"]);
}

export async function startServer(): Promise<string> {
  return exec(["start-server"]);
}

// -------------------------------------------------------------------------
// WiFi debugging
// -------------------------------------------------------------------------

export async function connectWifi(address: string): Promise<string> {
  return exec(["connect", address]);
}

export async function disconnectWifi(address: string): Promise<string> {
  return exec(["disconnect", address]);
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

export function extractErrorCode(output: string): string {
  const start = output.indexOf("Failure [");
  if (start !== -1) {
    const after = output.slice(start + 9);
    const end = after.indexOf("]");
    if (end !== -1) {
      const codeSection = after.slice(0, end);
      return codeSection.split(":")[0].trim();
    }
  }
  return "UNKNOWN_ERROR";
}
