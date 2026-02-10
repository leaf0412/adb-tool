import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useDevices } from "../hooks/useDevices";
import type { InstallResult } from "../types";
import "./InstallPage.css";

interface DeviceResult {
  serial: string;
  model: string;
  result: InstallResult | null;
  error: string | null;
}

function getAutoFixFlags(autoFix: string): string[] {
  switch (autoFix) {
    case "force_downgrade":
      return ["-r", "-d"];
    case "replace_install":
      return ["-r"];
    case "force_test_install":
      return ["-r", "-t"];
    case "uninstall_reinstall":
      return ["-r"];
    default:
      return ["-r"];
  }
}

function InstallPage() {
  const { devices } = useDevices();
  const connectedDevices = devices.filter((d) => d.state === "device");

  const [apkPath, setApkPath] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedSerials, setSelectedSerials] = useState<Set<string>>(
    new Set()
  );
  const [installing, setInstalling] = useState(false);
  const [results, setResults] = useState<DeviceResult[]>([]);
  const [fixingSerial, setFixingSerial] = useState<string | null>(null);

  // Drag-drop via Tauri API
  useEffect(() => {
    const unlisten = getCurrentWebviewWindow().onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        const apk = event.payload.paths.find((p: string) =>
          p.endsWith(".apk")
        );
        if (apk) setApkPath(apk);
        setDragOver(false);
      }
      if (event.payload.type === "over") setDragOver(true);
      if (event.payload.type === "leave") setDragOver(false);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Clean up selected serials when devices change
  useEffect(() => {
    setSelectedSerials((prev) => {
      const validSerials = new Set(connectedDevices.map((d) => d.serial));
      const next = new Set<string>();
      for (const s of prev) {
        if (validSerials.has(s)) next.add(s);
      }
      if (next.size !== prev.size) return next;
      return prev;
    });
  }, [connectedDevices]);

  const handleFilePick = useCallback(async () => {
    const file = await open({
      filters: [{ name: "APK", extensions: ["apk"] }],
    });
    if (typeof file === "string") setApkPath(file);
  }, []);

  const handleClear = useCallback(() => {
    setApkPath(null);
    setResults([]);
  }, []);

  const toggleDevice = useCallback((serial: string) => {
    setSelectedSerials((prev) => {
      const next = new Set(prev);
      if (next.has(serial)) {
        next.delete(serial);
      } else {
        next.add(serial);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    const allSerials = connectedDevices.map((d) => d.serial);
    setSelectedSerials((prev) => {
      if (prev.size === allSerials.length) {
        return new Set();
      }
      return new Set(allSerials);
    });
  }, [connectedDevices]);

  const handleInstall = useCallback(async () => {
    if (!apkPath || selectedSerials.size === 0) return;
    setInstalling(true);
    setResults([]);

    const deviceResults: DeviceResult[] = [];

    for (const serial of selectedSerials) {
      const device = connectedDevices.find((d) => d.serial === serial);
      try {
        const result = await invoke<InstallResult>("install_apk", {
          serial,
          apkPath,
          flags: ["-r"],
        });
        deviceResults.push({
          serial,
          model: device?.model || serial,
          result,
          error: null,
        });
      } catch (err) {
        deviceResults.push({
          serial,
          model: device?.model || serial,
          result: null,
          error: String(err),
        });
      }
    }

    setResults(deviceResults);
    setInstalling(false);
  }, [apkPath, selectedSerials, connectedDevices]);

  const handleAutoFix = useCallback(
    async (serial: string, autoFix: string) => {
      if (!apkPath) return;
      setFixingSerial(serial);

      const flags = getAutoFixFlags(autoFix);
      const device = connectedDevices.find((d) => d.serial === serial);

      try {
        const result = await invoke<InstallResult>("install_apk", {
          serial,
          apkPath,
          flags,
        });
        setResults((prev) =>
          prev.map((r) =>
            r.serial === serial
              ? { serial, model: device?.model || serial, result, error: null }
              : r
          )
        );
      } catch (err) {
        setResults((prev) =>
          prev.map((r) =>
            r.serial === serial
              ? {
                  serial,
                  model: device?.model || serial,
                  result: null,
                  error: String(err),
                }
              : r
          )
        );
      } finally {
        setFixingSerial(null);
      }
    },
    [apkPath, connectedDevices]
  );

  const apkFileName = apkPath ? apkPath.split("/").pop() : null;
  const canInstall = apkPath !== null && selectedSerials.size > 0 && !installing;

  return (
    <div className="install-page">
      <h2 className="install-title">安装 APK</h2>

      {/* Drop zone */}
      <div
        className={
          "install-dropzone" +
          (dragOver ? " install-dropzone--dragover" : "") +
          (apkPath ? " install-dropzone--selected" : "")
        }
        onClick={apkPath ? undefined : handleFilePick}
      >
        {apkPath ? (
          <div className="install-dropzone-selected">
            <span className="install-dropzone-filename">{apkFileName}</span>
            <button
              className="install-btn install-btn--clear"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
            >
              清除
            </button>
          </div>
        ) : (
          <div className="install-dropzone-hint">
            <span className="install-dropzone-hint-main">
              点击选择 APK 文件，或拖拽到此处
            </span>
            <span className="install-dropzone-hint-sub">仅支持 .apk 文件</span>
          </div>
        )}
      </div>

      {/* Device selection */}
      <div className="install-section">
        <div className="install-section-header">
          <h3 className="install-section-title">选择设备</h3>
          {connectedDevices.length > 0 && (
            <button className="install-btn install-btn--small" onClick={handleSelectAll}>
              {selectedSerials.size === connectedDevices.length ? "取消全选" : "全选"}
            </button>
          )}
        </div>

        {connectedDevices.length === 0 ? (
          <div className="install-empty">没有已连接的设备</div>
        ) : (
          <div className="install-device-list">
            {connectedDevices.map((device) => (
              <label key={device.serial} className="install-device-item">
                <input
                  type="checkbox"
                  className="install-device-checkbox"
                  checked={selectedSerials.has(device.serial)}
                  onChange={() => toggleDevice(device.serial)}
                />
                <span className="install-device-model">
                  {device.model || device.serial}
                </span>
                <span className="install-device-serial">{device.serial}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Install button */}
      <button
        className="install-btn install-btn--primary"
        disabled={!canInstall}
        onClick={handleInstall}
      >
        {installing ? "安装中..." : "安装"}
      </button>

      {/* Results */}
      {results.length > 0 && (
        <div className="install-results">
          <h3 className="install-section-title">安装结果</h3>
          <div className="install-results-list">
            {results.map((dr) => (
              <div
                key={dr.serial}
                className={
                  "install-result-card" +
                  (dr.result?.success
                    ? " install-result-card--success"
                    : " install-result-card--error")
                }
              >
                <div className="install-result-header">
                  <span className="install-result-device">{dr.model}</span>
                  <span className="install-result-serial">{dr.serial}</span>
                </div>

                {dr.result?.success && (
                  <div className="install-result-success">安装成功</div>
                )}

                {dr.error && (
                  <div className="install-result-error-text">{dr.error}</div>
                )}

                {dr.result && !dr.result.success && (
                  <div className="install-result-error-info">
                    {dr.result.error_code && (
                      <div className="install-result-field">
                        <span className="install-result-label">错误码:</span>
                        <span>{dr.result.error_code}</span>
                      </div>
                    )}
                    {dr.result.error_message_cn && (
                      <div className="install-result-field">
                        <span className="install-result-label">错误信息:</span>
                        <span>{dr.result.error_message_cn}</span>
                      </div>
                    )}
                    {dr.result.suggestion && (
                      <div className="install-result-field">
                        <span className="install-result-label">建议:</span>
                        <span>{dr.result.suggestion}</span>
                      </div>
                    )}
                    {dr.result.auto_fix && (
                      <button
                        className="install-btn install-btn--fix"
                        disabled={fixingSerial === dr.serial}
                        onClick={() =>
                          handleAutoFix(dr.serial, dr.result!.auto_fix!)
                        }
                      >
                        {fixingSerial === dr.serial ? "修复中..." : "一键修复"}
                      </button>
                    )}
                  </div>
                )}

                {(dr.result?.raw_output || dr.error) && (
                  <details className="install-result-details">
                    <summary>原始输出</summary>
                    <pre className="install-result-raw">
                      {dr.result?.raw_output || dr.error}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default InstallPage;
