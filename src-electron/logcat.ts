import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import type { BrowserWindow } from "electron";
import { getAdbPath } from "./adb";
import type { LogcatLine } from "../src/types";

const VALID_LEVELS = new Set(["V", "D", "I", "W", "E", "F", "S"]);

// -------------------------------------------------------------------------
// Parsing
// -------------------------------------------------------------------------

export function parseLogcatLine(line: string): LogcatLine | null {
  const trimmed = line.trim();
  if (trimmed.length < 20) return null;

  // Validate date prefix: MM-DD HH:MM:SS.mmm
  if (
    trimmed[2] !== "-" ||
    trimmed[5] !== " " ||
    trimmed[8] !== ":" ||
    trimmed[11] !== ":" ||
    trimmed[14] !== "."
  ) {
    return null;
  }

  const timestamp = trimmed.slice(0, 18);
  const rest = trimmed.slice(18).trimStart();

  // Split: PID TID LEVEL TAG: message
  const parts = rest.split(/\s+/);
  if (parts.length < 4) return null;

  const pid = parts[0];

  // Find TID and level: skip PID, next is TID, then level
  const afterPid = rest.slice(parts[0].length).trimStart();
  const parts2 = afterPid.split(/\s+/);
  if (parts2.length < 3) return null;

  const tid = parts2[0];

  const afterTid = afterPid.slice(parts2[0].length).trimStart();
  const parts3 = afterTid.split(/\s+/);
  if (parts3.length === 0) return null;

  const level = parts3[0];
  if (!VALID_LEVELS.has(level)) return null;

  const afterLevel =
    parts3.length > 1 ? afterTid.slice(parts3[0].length).trimStart() : "";

  // Tag and message separated by ": "
  let tag: string;
  let message: string;
  const colonPos = afterLevel.indexOf(": ");
  if (colonPos !== -1) {
    tag = afterLevel.slice(0, colonPos).trim();
    message = afterLevel.slice(colonPos + 2);
  } else if (afterLevel.endsWith(":")) {
    tag = afterLevel.slice(0, -1).trim();
    message = "";
  } else {
    tag = afterLevel.trim();
    message = "";
  }

  return { timestamp, pid, tid, level, tag, message, raw: line };
}

// -------------------------------------------------------------------------
// Log directory management
// -------------------------------------------------------------------------

function getLogDir(): string {
  const logDir = join(homedir(), "AdbTool", "logs");
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
  return logDir;
}

export function cleanupOldLogs(): void {
  const logDir = getLogDir();
  let entries: string[];
  try {
    entries = readdirSync(logDir);
  } catch {
    return;
  }

  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  for (const entry of entries) {
    const fullPath = join(logDir, entry);
    try {
      const stat = statSync(fullPath);
      if (stat.isFile() && now - stat.mtimeMs > sevenDays) {
        unlinkSync(fullPath);
      }
    } catch {
      // ignore individual file errors
    }
  }
}

// -------------------------------------------------------------------------
// Stream control
// -------------------------------------------------------------------------

interface ActiveStream {
  proc: ChildProcess;
}

const activeStreams = new Map<string, ActiveStream>();

export function startStream(
  serial: string,
  mainWindow: BrowserWindow,
): number {
  if (activeStreams.has(serial)) {
    throw new Error(`Logcat stream already active for device ${serial}`);
  }

  const adbPath = getAdbPath();
  const logDir = getLogDir();
  const timestamp = new Date()
    .toISOString()
    .replace(/[:\-T]/g, "")
    .slice(0, 15);
  const logPath = join(logDir, `logcat_${serial}_${timestamp}.log`);
  const logStream = createWriteStream(logPath, { flags: "a" });

  const proc = spawn(adbPath, ["-s", serial, "logcat", "-v", "threadtime"]);

  const pid = proc.pid ?? 0;
  activeStreams.set(serial, { proc });

  const eventName = `logcat-line-${serial}`;

  const rl = createInterface({ input: proc.stdout! });
  rl.on("line", (line) => {
    logStream.write(line + "\n");

    const parsed = parseLogcatLine(line);
    if (parsed) {
      mainWindow.webContents.send(eventName, parsed);
    } else if (line.trim()) {
      const rawLine: LogcatLine = {
        timestamp: "",
        pid: "",
        tid: "",
        level: "",
        tag: "",
        message: line,
        raw: line,
      };
      mainWindow.webContents.send(eventName, rawLine);
    }
  });

  proc.stderr?.on("data", (chunk: Buffer) => {
    logStream.write(`[STDERR] ${chunk.toString()}`);
  });

  proc.on("close", (code) => {
    logStream.write(`\n--- logcat terminated: code ${code} ---\n`);
    logStream.end();
    activeStreams.delete(serial);
  });

  return pid;
}

export function stopStream(serial: string): void {
  const stream = activeStreams.get(serial);
  if (!stream) {
    throw new Error(`No active logcat stream for device ${serial}`);
  }
  stream.proc.kill("SIGTERM");
  activeStreams.delete(serial);
}

export function stopAllStreams(): void {
  for (const [serial, stream] of activeStreams) {
    stream.proc.kill("SIGTERM");
    activeStreams.delete(serial);
  }
}
