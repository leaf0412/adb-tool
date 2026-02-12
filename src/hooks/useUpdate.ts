import { useState, useEffect, useCallback, useRef } from "react";
import { bridge } from "../bridge";
import type { UpdateInfo, UpdateProgress, UpdateStatus } from "../bridge";

export function useUpdate() {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState("0.0.0");
  const checkedRef = useRef(false);

  // Fetch app version on mount
  useEffect(() => {
    bridge()
      .getAppVersion()
      .then(setAppVersion)
      .catch(() => {});
  }, []);

  const check = useCallback(async () => {
    setStatus("checking");
    setError(null);
    try {
      const info = await bridge().checkForUpdates();
      setUpdateInfo(info);
      setStatus(info.available ? "available" : "idle");
      return info;
    } catch (err) {
      setError(String(err));
      setStatus("error");
      return null;
    }
  }, []);

  const download = useCallback(async () => {
    setStatus("downloading");
    setProgress(null);
    setError(null);
    let unlisten: (() => void) | null = null;
    try {
      unlisten = await bridge().onUpdateProgress((p) => {
        setProgress(p);
      });
      await bridge().downloadUpdate();
      setStatus("ready");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    } finally {
      unlisten?.();
    }
  }, []);

  const install = useCallback(async () => {
    try {
      await bridge().installUpdate();
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }, []);

  const dismiss = useCallback(() => {
    setStatus("idle");
    setUpdateInfo(null);
  }, []);

  // Auto-check once on mount
  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    check().catch(() => {});
  }, [check]);

  return { status, updateInfo, progress, error, appVersion, check, download, install, dismiss };
}
