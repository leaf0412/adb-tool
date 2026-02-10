import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AdbDevice, DeviceDetail } from "../types";

const REFRESH_INTERVAL = 3000;

export function useDevices() {
  const [devices, setDevices] = useState<AdbDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await invoke<AdbDevice[]>("get_devices");
      setDevices(list);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [refresh]);

  return { devices, loading, error, refresh };
}

export async function getDeviceDetail(serial: string): Promise<DeviceDetail> {
  return invoke<DeviceDetail>("get_device_detail", { serial });
}

export async function connectWifi(address: string): Promise<string> {
  return invoke<string>("connect_wifi", { address });
}

export async function restartServer(): Promise<void> {
  await invoke("kill_server");
  await invoke("start_server");
}
