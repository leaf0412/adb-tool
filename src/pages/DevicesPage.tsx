import { useState, useCallback } from "react";
import { useDevices, getDeviceDetail, connectWifi, restartServer } from "../hooks/useDevices";
import type { AdbDevice, DeviceDetail } from "../types";
import "./DevicesPage.css";

interface StateInfo {
  label: string;
  color: string;
  hint: string;
}

const STATE_MAP: Record<string, StateInfo> = {
  device: { label: "已连接", color: "green", hint: "" },
  unauthorized: {
    label: "未授权",
    color: "orange",
    hint: "请在设备上确认「允许 USB 调试」",
  },
  offline: {
    label: "离线",
    color: "red",
    hint: "请重新插拔 USB 或重启 adb 服务",
  },
};

function getStateInfo(state: string): StateInfo {
  return STATE_MAP[state] ?? { label: state, color: "gray", hint: "" };
}

function DevicesPage() {
  const { devices, loading, error, refresh } = useDevices();

  const [selectedSerial, setSelectedSerial] = useState<string | null>(null);
  const [detail, setDetail] = useState<DeviceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [wifiAddress, setWifiAddress] = useState("");
  const [wifiLoading, setWifiLoading] = useState(false);
  const [wifiResult, setWifiResult] = useState<string | null>(null);
  const [wifiError, setWifiError] = useState<string | null>(null);

  const [restarting, setRestarting] = useState(false);

  const handleSelectDevice = useCallback(async (device: AdbDevice) => {
    if (device.state !== "device") {
      setSelectedSerial(null);
      setDetail(null);
      return;
    }
    setSelectedSerial(device.serial);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const d = await getDeviceDetail(device.serial);
      setDetail(d);
    } catch (err) {
      setDetailError(String(err));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleRestart = useCallback(async () => {
    setRestarting(true);
    try {
      await restartServer();
      await refresh();
    } catch (_err) {
      // refresh will pick up the error state
    } finally {
      setRestarting(false);
    }
  }, [refresh]);

  const handleWifiConnect = useCallback(async () => {
    if (!wifiAddress.trim()) return;
    setWifiLoading(true);
    setWifiResult(null);
    setWifiError(null);
    try {
      const result = await connectWifi(wifiAddress.trim());
      setWifiResult(result);
      await refresh();
    } catch (err) {
      setWifiError(String(err));
    } finally {
      setWifiLoading(false);
    }
  }, [wifiAddress, refresh]);

  return (
    <div className="devices-page">
      <div className="devices-header">
        <h2 className="devices-title">设备管理</h2>
        <div className="devices-header-actions">
          <button
            className="devices-btn"
            onClick={refresh}
            disabled={loading}
          >
            {loading ? "刷新中..." : "刷新"}
          </button>
          <button
            className="devices-btn devices-btn--secondary"
            onClick={handleRestart}
            disabled={restarting}
          >
            {restarting ? "重启中..." : "重启 ADB 服务"}
          </button>
        </div>
      </div>

      {error && (
        <div className="devices-error">
          {error}
        </div>
      )}

      {!loading && !error && devices.length === 0 && (
        <div className="devices-empty">
          未检测到设备，请连接 USB 或通过 WiFi 连接
        </div>
      )}

      {devices.length > 0 && (
        <div className="devices-card-list">
          {devices.map((device) => {
            const info = getStateInfo(device.state);
            const isSelected = selectedSerial === device.serial;
            return (
              <div
                key={device.serial}
                className={
                  "device-card" + (isSelected ? " device-card--selected" : "")
                }
                onClick={() => handleSelectDevice(device)}
              >
                <div className="device-card-header">
                  <span className="device-card-model">
                    {device.model || device.serial}
                  </span>
                  <span
                    className="device-card-badge"
                    data-color={info.color}
                  >
                    {info.label}
                  </span>
                </div>
                <div className="device-card-serial">{device.serial}</div>
                {info.hint && (
                  <div className="device-card-hint">{info.hint}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedSerial && (
        <div className="devices-detail-panel">
          <h3 className="devices-detail-title">设备详情</h3>
          {detailLoading && <div className="devices-detail-loading">加载中...</div>}
          {detailError && <div className="devices-error">{detailError}</div>}
          {detail && !detailLoading && (
            <table className="devices-detail-table">
              <tbody>
                <tr>
                  <td className="devices-detail-label">型号</td>
                  <td>{detail.model}</td>
                </tr>
                <tr>
                  <td className="devices-detail-label">序列号</td>
                  <td>{detail.serial}</td>
                </tr>
                <tr>
                  <td className="devices-detail-label">Android 版本</td>
                  <td>{detail.android_version}</td>
                </tr>
                <tr>
                  <td className="devices-detail-label">SDK 版本</td>
                  <td>{detail.sdk_version}</td>
                </tr>
                <tr>
                  <td className="devices-detail-label">存储</td>
                  <td>
                    {detail.storage_free_mb} MB 可用 / {detail.storage_total_mb} MB 总计
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="devices-wifi-section">
        <h3 className="devices-wifi-title">WiFi 连接</h3>
        <div className="devices-wifi-row">
          <input
            className="devices-wifi-input"
            type="text"
            placeholder="输入 IP:端口，例如 192.168.1.100:5555"
            value={wifiAddress}
            onChange={(e) => setWifiAddress(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleWifiConnect();
            }}
          />
          <button
            className="devices-btn"
            onClick={handleWifiConnect}
            disabled={wifiLoading || !wifiAddress.trim()}
          >
            {wifiLoading ? "连接中..." : "连接"}
          </button>
        </div>
        {wifiResult && (
          <div className="devices-wifi-result">{wifiResult}</div>
        )}
        {wifiError && (
          <div className="devices-wifi-error">{wifiError}</div>
        )}
      </div>
    </div>
  );
}

export default DevicesPage;
