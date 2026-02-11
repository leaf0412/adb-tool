import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { bridge } from "../bridge";
import type { UnlistenFn } from "../bridge";
import { useDevices } from "../hooks/useDevices";
import type { LogcatLine } from "../types";
import "./LogcatPage.css";

const LEVELS = ["V", "D", "I", "W", "E", "F"] as const;
const MAX_LINES = 1000;

function LogcatPage() {
  const { devices } = useDevices();
  const connectedDevices = devices.filter((d) => d.state === "device");

  const [selectedDevice, setSelectedDevice] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [paused, setPaused] = useState(false);
  const [lines, setLines] = useState<LogcatLine[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [levelFilter, setLevelFilter] = useState("V");
  const [tagFilter, setTagFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");

  // Refs for auto-scroll and cleanup
  const containerRef = useRef<HTMLDivElement>(null);
  const autoScroll = useRef(true);
  const streamingRef = useRef(false);
  const selectedDeviceRef = useRef("");
  const pausedRef = useRef(false);

  // Keep refs in sync with state
  streamingRef.current = streaming;
  selectedDeviceRef.current = selectedDevice;
  pausedRef.current = paused;

  // Auto-select first connected device
  useEffect(() => {
    if (!selectedDevice && connectedDevices.length > 0) {
      setSelectedDevice(connectedDevices[0].serial);
    }
    if (
      selectedDevice &&
      !connectedDevices.some((d) => d.serial === selectedDevice)
    ) {
      setSelectedDevice(connectedDevices[0]?.serial ?? "");
    }
  }, [connectedDevices, selectedDevice]);

  // Filter lines
  const filteredLines = useMemo(() => {
    const levelIndex = LEVELS.indexOf(levelFilter as typeof LEVELS[number]);
    return lines.filter((line) => {
      const lineLevelIdx = LEVELS.indexOf(line.level as typeof LEVELS[number]);
      if (lineLevelIdx < levelIndex) return false;
      if (tagFilter && !line.tag.toLowerCase().includes(tagFilter.toLowerCase()))
        return false;
      if (
        searchFilter &&
        !line.raw.toLowerCase().includes(searchFilter.toLowerCase())
      )
        return false;
      return true;
    });
  }, [lines, levelFilter, tagFilter, searchFilter]);

  // Auto-scroll on new filtered lines
  useEffect(() => {
    if (autoScroll.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [filteredLines]);

  // Handle scroll to detect manual scroll-up
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    autoScroll.current = nearBottom;
  }, []);

  // Start/stop streaming and event listener lifecycle
  useEffect(() => {
    if (!streaming || !selectedDevice) return;

    let unlisten: UnlistenFn | null = null;
    let cancelled = false;

    const setup = async () => {
      try {
        await bridge().startLogcat(selectedDevice);

        if (cancelled) {
          await bridge().stopLogcat(selectedDevice).catch(() => {});
          return;
        }

        unlisten = await bridge().onLogcatLine(selectedDevice, (line) => {
          if (!pausedRef.current) {
            setLines((prev) => {
              const next = [...prev, line];
              return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
            });
          }
        });
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
          setStreaming(false);
        }
      }
    };

    setup();

    return () => {
      cancelled = true;
      if (unlisten) {
        unlisten();
      }
      bridge().stopLogcat(selectedDevice).catch(() => {});
    };
  }, [streaming, selectedDevice]);

  // Stop streaming when device changes
  const handleDeviceChange = useCallback(
    (serial: string) => {
      if (streaming) {
        setStreaming(false);
      }
      setLines([]);
      setPaused(false);
      setError(null);
      autoScroll.current = true;
      setSelectedDevice(serial);
    },
    [streaming]
  );

  const handleToggleStreaming = useCallback(async () => {
    if (streaming) {
      setStreaming(false);
    } else {
      setError(null);
      setStreaming(true);
    }
  }, [streaming]);

  const handleTogglePause = useCallback(() => {
    setPaused((prev) => !prev);
  }, []);

  const handleClear = useCallback(() => {
    setLines([]);
    autoScroll.current = true;
  }, []);

  const handleExport = useCallback(() => {
    const text = filteredLines.map((l) => l.raw).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logcat_${selectedDevice}_${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredLines, selectedDevice]);

  return (
    <div className="logcat-page">
      <div className="logcat-header">
        <h2 className="logcat-title">日志查看</h2>
      </div>

      {/* Controls bar */}
      <div className="logcat-controls">
        <select
          className="logcat-select"
          value={selectedDevice}
          onChange={(e) => handleDeviceChange(e.target.value)}
          disabled={connectedDevices.length === 0 || streaming}
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

        <button
          className={
            "logcat-btn" + (streaming ? " logcat-btn--danger" : " logcat-btn--active")
          }
          onClick={handleToggleStreaming}
          disabled={!selectedDevice}
        >
          {streaming ? "停止" : "开始"}
        </button>

        <button
          className={
            "logcat-btn" +
            (paused ? " logcat-btn--active" : " logcat-btn--secondary")
          }
          onClick={handleTogglePause}
          disabled={!streaming}
        >
          {paused ? "继续" : "暂停"}
        </button>

        <button
          className="logcat-btn logcat-btn--secondary"
          onClick={handleClear}
          disabled={lines.length === 0}
        >
          清空
        </button>

        <button
          className="logcat-btn logcat-btn--secondary"
          onClick={handleExport}
          disabled={filteredLines.length === 0}
        >
          导出
        </button>
      </div>

      {/* Error */}
      {error && <div className="logcat-error">{error}</div>}

      {/* Filters bar */}
      <div className="logcat-filters">
        <select
          className="logcat-select"
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          style={{ minWidth: 80 }}
        >
          {LEVELS.map((lvl) => (
            <option key={lvl} value={lvl}>
              {lvl} 及以上
            </option>
          ))}
        </select>

        <input
          className="logcat-filter-input"
          type="text"
          placeholder="过滤 Tag..."
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
        />

        <input
          className="logcat-filter-input"
          type="text"
          placeholder="搜索关键词..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          style={{ flex: 1 }}
        />

        <span className="logcat-line-count">
          {filteredLines.length} / {lines.length} 条
        </span>
      </div>

      {/* Log container */}
      <div
        className="logcat-container"
        ref={containerRef}
        onScroll={handleScroll}
      >
        {lines.length === 0 && (
          <div className="logcat-empty">
            {streaming ? "等待日志输出..." : "点击「开始」采集日志"}
          </div>
        )}
        {filteredLines.map((line, idx) => (
          <div
            className="logcat-line"
            key={idx}
            data-level={line.level}
          >
            <span className="logcat-timestamp">{line.timestamp}</span>
            <span className="logcat-level" data-level={line.level}>
              {line.level}
            </span>
            <span className="logcat-tag">{line.tag}</span>
            <span className="logcat-message">{line.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default LogcatPage;
