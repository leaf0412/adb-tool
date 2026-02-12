import type { Bridge } from "./types";
export type { Bridge, UnlistenFn, DragDropPayload, UpdateInfo, UpdateProgress, UpdateStatus } from "./types";

let bridgeInstance: Bridge | null = null;

export async function getBridge(): Promise<Bridge> {
  if (bridgeInstance) return bridgeInstance;
  if ("__TAURI_INTERNALS__" in window) {
    const { tauriBridge } = await import("./tauri");
    bridgeInstance = tauriBridge;
  } else {
    const { electronBridge } = await import("./electron");
    bridgeInstance = electronBridge;
  }
  return bridgeInstance;
}

export function bridge(): Bridge {
  if (!bridgeInstance) throw new Error("Bridge not initialized. Call getBridge() first.");
  return bridgeInstance;
}
