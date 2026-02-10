import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useDevices } from "../hooks/useDevices";
import { useRefreshOnActivate } from "../hooks/useRefreshOnActivate";
import type { InstalledApp } from "../types";
import "./AppsPage.css";

function AppsPage() {
  const { devices } = useDevices();
  const connectedDevices = devices.filter((d) => d.state === "device");

  const [selectedSerial, setSelectedSerial] = useState<string>("");
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showSystem, setShowSystem] = useState(false);
  const [selectedPkgs, setSelectedPkgs] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{
    message: string;
    onConfirm?: () => void;
  } | null>(null);

  // Auto-select first connected device
  useEffect(() => {
    if (!selectedSerial && connectedDevices.length > 0) {
      setSelectedSerial(connectedDevices[0].serial);
    }
    // Clear selection if the device disconnected
    if (
      selectedSerial &&
      !connectedDevices.some((d) => d.serial === selectedSerial)
    ) {
      setSelectedSerial(connectedDevices[0]?.serial ?? "");
    }
  }, [connectedDevices, selectedSerial]);

  // Load apps when device or showSystem changes
  const loadApps = useCallback(async () => {
    if (!selectedSerial) {
      setApps([]);
      return;
    }
    setLoading(true);
    setError(null);
    setSelectedPkgs(new Set());
    try {
      const list = await invoke<InstalledApp[]>("get_packages", {
        serial: selectedSerial,
        includeSystem: showSystem,
      });
      setApps(list);
    } catch (err) {
      setError(String(err));
      setApps([]);
    } finally {
      setLoading(false);
    }
  }, [selectedSerial, showSystem]);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  useRefreshOnActivate("/apps", loadApps);

  // Filter by search text
  const filteredApps = apps.filter((app) =>
    app.package_name.toLowerCase().includes(search.toLowerCase())
  );

  // Toggle single selection
  const toggleSelect = useCallback((pkg: string) => {
    setSelectedPkgs((prev) => {
      const next = new Set(prev);
      if (next.has(pkg)) {
        next.delete(pkg);
      } else {
        next.add(pkg);
      }
      return next;
    });
  }, []);

  // Single-app actions
  const handleLaunch = useCallback(
    async (packageName: string) => {
      setActionLoading(`launch-${packageName}`);
      try {
        await invoke("launch_app", { serial: selectedSerial, packageName });
      } catch (err) {
        setDialog({ message: String(err) });
      } finally {
        setActionLoading(null);
      }
    },
    [selectedSerial]
  );

  const handleStop = useCallback(
    async (packageName: string) => {
      setActionLoading(`stop-${packageName}`);
      try {
        await invoke("force_stop", { serial: selectedSerial, packageName });
      } catch (err) {
        setDialog({ message: String(err) });
      } finally {
        setActionLoading(null);
      }
    },
    [selectedSerial]
  );

  const handleClearData = useCallback(
    async (packageName: string) => {
      setActionLoading(`clear-${packageName}`);
      try {
        await invoke("clear_app_data", { serial: selectedSerial, packageName });
      } catch (err) {
        setDialog({ message: String(err) });
      } finally {
        setActionLoading(null);
      }
    },
    [selectedSerial]
  );

  const handleUninstall = useCallback(
    (packageName: string) => {
      setDialog({
        message: `确认卸载 ${packageName} ？此操作不可撤销。`,
        onConfirm: async () => {
          setDialog(null);
          setActionLoading(`uninstall-${packageName}`);
          try {
            await invoke("uninstall_app", { serial: selectedSerial, packageName });
            setApps((prev) => prev.filter((a) => a.package_name !== packageName));
            setSelectedPkgs((prev) => {
              const next = new Set(prev);
              next.delete(packageName);
              return next;
            });
          } catch (err) {
            setDialog({ message: String(err) });
          } finally {
            setActionLoading(null);
          }
        },
      });
    },
    [selectedSerial]
  );

  // Batch uninstall
  const handleBatchUninstall = useCallback(() => {
    if (selectedPkgs.size === 0) return;
    setDialog({
      message: `确认批量卸载选中的 ${selectedPkgs.size} 个应用？此操作不可撤销。`,
      onConfirm: async () => {
        setDialog(null);
        setActionLoading("batch-uninstall");
        const failed: string[] = [];
        for (const pkg of selectedPkgs) {
          try {
            await invoke("uninstall_app", {
              serial: selectedSerial,
              packageName: pkg,
            });
          } catch {
            failed.push(pkg);
          }
        }
        await loadApps();
        setActionLoading(null);
        if (failed.length > 0) {
          setDialog({ message: `以下应用卸载失败:\n${failed.join("\n")}` });
        }
      },
    });
  }, [selectedPkgs, selectedSerial, loadApps]);

  return (
    <div className="apps-page">
      <div className="apps-header">
        <h2 className="apps-title">应用管理</h2>
      </div>

      {/* Controls bar */}
      <div className="apps-controls">
        <select
          className="apps-select"
          value={selectedSerial}
          onChange={(e) => setSelectedSerial(e.target.value)}
          disabled={connectedDevices.length === 0}
        >
          {connectedDevices.length === 0 && (
            <option value="">无可用设备</option>
          )}
          {connectedDevices.map((d) => (
            <option key={d.serial} value={d.serial}>
              {d.model || d.serial}
            </option>
          ))}
        </select>

        <input
          className="apps-search"
          type="text"
          placeholder="搜索包名..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <label className="apps-checkbox-label">
          <input
            type="checkbox"
            className="apps-checkbox"
            checked={showSystem}
            onChange={(e) => setShowSystem(e.target.checked)}
          />
          显示系统应用
        </label>

        <button
          className="apps-btn"
          onClick={loadApps}
          disabled={loading || !selectedSerial}
        >
          {loading ? "加载中..." : "刷新"}
        </button>

        <button
          className="apps-btn apps-btn--danger"
          onClick={handleBatchUninstall}
          disabled={
            selectedPkgs.size === 0 || actionLoading === "batch-uninstall"
          }
        >
          {actionLoading === "batch-uninstall"
            ? "卸载中..."
            : `批量卸载${selectedPkgs.size > 0 ? ` (${selectedPkgs.size})` : ""}`}
        </button>
      </div>

      {/* Error */}
      {error && <div className="apps-error">{error}</div>}

      {/* Empty state */}
      {!loading && !error && selectedSerial && apps.length === 0 && (
        <div className="apps-empty">未找到应用</div>
      )}

      {!selectedSerial && (
        <div className="apps-empty">请先连接设备</div>
      )}

      {/* App list */}
      {filteredApps.length > 0 && (
        <div className="apps-list">
          {filteredApps.map((app) => {
            const pkg = app.package_name;
            const isSelected = selectedPkgs.has(pkg);
            const isLoading = actionLoading?.endsWith(pkg) ?? false;
            return (
              <div
                key={pkg}
                className={
                  "apps-row" + (isSelected ? " apps-row--selected" : "")
                }
              >
                <label className="apps-row-check">
                  <input
                    type="checkbox"
                    className="apps-row-checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(pkg)}
                  />
                </label>
                <div className="apps-row-info">
                  <span className="apps-row-pkg">{pkg}</span>
                  {app.version_name && (
                    <span className="apps-row-version">
                      v{app.version_name}
                    </span>
                  )}
                </div>
                <div className="apps-row-actions">
                  <button
                    className="apps-btn apps-btn--small"
                    onClick={() => handleLaunch(pkg)}
                    disabled={isLoading}
                  >
                    启动
                  </button>
                  <button
                    className="apps-btn apps-btn--small apps-btn--secondary"
                    onClick={() => handleStop(pkg)}
                    disabled={isLoading}
                  >
                    停止
                  </button>
                  <button
                    className="apps-btn apps-btn--small apps-btn--secondary"
                    onClick={() => handleClearData(pkg)}
                    disabled={isLoading}
                  >
                    清数据
                  </button>
                  <button
                    className="apps-btn apps-btn--small apps-btn--danger"
                    onClick={() => handleUninstall(pkg)}
                    disabled={isLoading}
                  >
                    卸载
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Filtered empty */}
      {apps.length > 0 && filteredApps.length === 0 && search && (
        <div className="apps-empty">
          没有匹配 &quot;{search}&quot; 的应用
        </div>
      )}

      {/* Dialog */}
      {dialog && (
        <div className="apps-confirm-overlay" onClick={() => setDialog(null)}>
          <div className="apps-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="apps-confirm-message">{dialog.message}</p>
            <div className="apps-confirm-actions">
              {dialog.onConfirm ? (
                <>
                  <button
                    className="apps-btn apps-btn--secondary"
                    onClick={() => setDialog(null)}
                  >
                    取消
                  </button>
                  <button
                    className="apps-btn apps-btn--danger"
                    onClick={dialog.onConfirm}
                  >
                    确认卸载
                  </button>
                </>
              ) : (
                <button
                  className="apps-btn"
                  onClick={() => setDialog(null)}
                >
                  确定
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AppsPage;
