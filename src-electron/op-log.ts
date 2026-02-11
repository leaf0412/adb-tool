import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { OpLogEntry } from "../src/types";

const LOG_DIR = join(homedir(), "AdbTool");
const LOG_PATH = join(LOG_DIR, "op_history.json");

let entries: OpLogEntry[] = [];

function loadFromFile(): OpLogEntry[] {
  if (!existsSync(LOG_PATH)) return [];
  try {
    const data = readFileSync(LOG_PATH, "utf-8");
    if (!data.trim()) return [];
    return JSON.parse(data) as OpLogEntry[];
  } catch {
    return [];
  }
}

function saveToFile(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
  writeFileSync(LOG_PATH, JSON.stringify(entries, null, 2), "utf-8");
}

export function initOpLog(): void {
  entries = loadFromFile();
}

export function addEntry(entry: OpLogEntry): void {
  entries.push(entry);
  saveToFile();
}

export function getEntries(
  opType: string | null,
  device: string | null,
): OpLogEntry[] {
  return entries.filter((e) => {
    if (opType && e.op_type !== opType) return false;
    if (device && e.device !== device) return false;
    return true;
  });
}

export function clearEntries(): void {
  entries = [];
  saveToFile();
}
