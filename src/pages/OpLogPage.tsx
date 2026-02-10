import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useRefreshOnActivate } from "../hooks/useRefreshOnActivate";
import type { OpLogEntry } from "../types";
import "./OpLogPage.css";

const opTypeLabels: Record<string, string> = {
  install: "安装",
  uninstall: "卸载",
  screenshot: "截图",
  upload: "上传",
  download: "下载",
};

const OP_TYPE_OPTIONS = ["", "install", "uninstall", "screenshot", "upload", "download"];

function OpLogPage() {
  const [allLogs, setAllLogs] = useState<OpLogEntry[]>([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [deviceFilter, setDeviceFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const logs = await invoke<OpLogEntry[]>("get_op_logs", {
        opType: null,
        device: null,
      });
      setAllLogs(logs.reverse());
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useRefreshOnActivate("/oplog", loadLogs);

  // Extract unique devices from ALL logs so the filter always shows every device
  const uniqueDevices = useMemo(() => {
    const deviceSet = new Set<string>();
    for (const log of allLogs) {
      if (log.device) {
        deviceSet.add(log.device);
      }
    }
    return Array.from(deviceSet).sort();
  }, [allLogs]);

  // Apply filters client-side on the full data set
  const filteredLogs = useMemo(() => {
    return allLogs.filter((log) => {
      if (typeFilter && log.op_type !== typeFilter) return false;
      if (deviceFilter && log.device !== deviceFilter) return false;
      return true;
    });
  }, [allLogs, typeFilter, deviceFilter]);

  return (
    <div className="oplog-page">
      <div className="oplog-header">
        <h2 className="oplog-title">操作记录</h2>
      </div>

      {/* Filters bar */}
      <div className="oplog-filters">
        <select
          className="oplog-select"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          {OP_TYPE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt === "" ? "全部类型" : opTypeLabels[opt] ?? opt}
            </option>
          ))}
        </select>

        <select
          className="oplog-select"
          value={deviceFilter}
          onChange={(e) => setDeviceFilter(e.target.value)}
        >
          <option value="">全部设备</option>
          {uniqueDevices.map((dev) => (
            <option key={dev} value={dev}>
              {dev}
            </option>
          ))}
        </select>

        <button
          className="oplog-btn"
          onClick={loadLogs}
          disabled={loading}
        >
          {loading ? "刷新中..." : "刷新"}
        </button>
      </div>

      {/* Error */}
      {error && <div className="oplog-error">{error}</div>}

      {/* Empty state */}
      {!loading && !error && filteredLogs.length === 0 && (
        <div className="oplog-empty">暂无操作记录</div>
      )}

      {/* Log list */}
      {filteredLogs.length > 0 && (
        <div className="oplog-list">
          {filteredLogs.map((log, idx) => (
            <div
              key={idx}
              className={
                "oplog-entry" + (!log.success ? " oplog-entry--fail" : "")
              }
            >
              <div className="oplog-entry-header">
                <span className="oplog-entry-timestamp">
                  {log.timestamp}
                </span>
                <span className="oplog-entry-type">
                  {opTypeLabels[log.op_type] ?? log.op_type}
                </span>
                <span className="oplog-entry-device">{log.device}</span>
                <span
                  className={
                    "oplog-entry-status" +
                    (log.success
                      ? " oplog-entry-status--success"
                      : " oplog-entry-status--fail")
                  }
                >
                  {log.success ? "成功" : "失败"}
                </span>
              </div>

              <div className="oplog-entry-detail">{log.detail}</div>

              {log.command && (
                <div className="oplog-entry-command">
                  <span className="oplog-entry-command-label">命令</span>
                  <code className="oplog-entry-command-text">{log.command}</code>
                </div>
              )}

              {!log.success && log.error_message && (
                <div className="oplog-entry-error">{log.error_message}</div>
              )}

              {log.raw_output && (
                <details className="oplog-entry-raw">
                  <summary>原始输出</summary>
                  <pre className="oplog-entry-raw-content">
                    {log.raw_output}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default OpLogPage;
