import { useState, useEffect, useCallback } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useDevices } from "../hooks/useDevices";
import "./FilesPage.css";

interface FileEntry {
  name: string;
  isDirectory: boolean;
  raw: string;
}

const QUICK_PATHS = [
  { label: "Download", path: "/sdcard/Download/" },
  { label: "DCIM", path: "/sdcard/DCIM/" },
  { label: "Pictures", path: "/sdcard/Pictures/" },
  { label: "Documents", path: "/sdcard/Documents/" },
];

function parseLsLine(line: string): FileEntry | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("total")) return null;
  const isDirectory = trimmed.charAt(0) === "d";
  // The filename is the last whitespace-separated token.
  // However ls -la output may have filenames with spaces; the name starts
  // after the date+time columns. A reliable approach: split by whitespace
  // and take everything from the 8th token onward (fields: perms, links,
  // owner, group, size, date, time, name...).
  const parts = trimmed.split(/\s+/);
  if (parts.length < 8) return null;
  const name = parts.slice(7).join(" ");
  if (!name || name === "." || name === "..") return null;
  return { name, isDirectory, raw: trimmed };
}

function FilesPage() {
  const { devices } = useDevices();
  const connectedDevices = devices.filter((d) => d.state === "device");

  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [remotePath, setRemotePath] = useState<string>("/sdcard/");
  const [pathInput, setPathInput] = useState<string>("/sdcard/");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [screenshotPath, setScreenshotPath] = useState<string | null>(null);

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

  const loadFiles = useCallback(
    async (path?: string) => {
      const dir = path ?? remotePath;
      if (!selectedDevice) return;
      setLoading(true);
      setStatus("");
      try {
        const lines = await invoke<string[]>("list_remote_files", {
          serial: selectedDevice,
          remoteDir: dir,
        });
        const entries: FileEntry[] = [];
        for (const line of lines) {
          const entry = parseLsLine(line);
          if (entry) entries.push(entry);
        }
        // Sort: directories first, then alphabetical
        entries.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        setFiles(entries);
        setRemotePath(dir);
        setPathInput(dir);
      } catch (err) {
        setStatus("加载失败: " + String(err));
        setFiles([]);
      } finally {
        setLoading(false);
      }
    },
    [selectedDevice, remotePath]
  );

  // Load files when device changes
  useEffect(() => {
    if (selectedDevice) {
      loadFiles("/sdcard/");
    } else {
      setFiles([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDevice]);

  const navigateTo = useCallback(
    (dirName: string) => {
      let newPath: string;
      if (dirName === "..") {
        // Go up one level
        const parts = remotePath.replace(/\/$/, "").split("/");
        parts.pop();
        newPath = parts.join("/") + "/";
        if (newPath === "/") newPath = "/";
      } else {
        newPath = remotePath + dirName + "/";
      }
      loadFiles(newPath);
    },
    [remotePath, loadFiles]
  );

  const handleBrowse = useCallback(() => {
    let path = pathInput.trim();
    if (!path) return;
    if (!path.endsWith("/")) path += "/";
    loadFiles(path);
  }, [pathInput, loadFiles]);

  const handleScreenshot = useCallback(async () => {
    if (!selectedDevice) return;
    const savePath = await save({
      defaultPath: `screenshot_${Date.now()}.png`,
      filters: [{ name: "Image", extensions: ["png"] }],
    });
    if (!savePath) return;
    setStatus("正在截图...");
    try {
      await invoke("take_screenshot", {
        serial: selectedDevice,
        localPath: savePath,
      });
      setScreenshotPath(savePath);
      setStatus("截图已保存: " + savePath);
    } catch (err) {
      setStatus("截图失败: " + String(err));
    }
  }, [selectedDevice]);

  const handleUpload = useCallback(async () => {
    if (!selectedDevice) return;
    const file = await open();
    if (typeof file !== "string") return;
    setStatus("正在上传...");
    try {
      const fileName =
        file.split("/").pop() || file.split("\\").pop() || "file";
      await invoke("push_file", {
        serial: selectedDevice,
        localPath: file,
        remotePath: remotePath + fileName,
      });
      setStatus("上传成功: " + fileName);
      loadFiles();
    } catch (err) {
      setStatus("上传失败: " + String(err));
    }
  }, [selectedDevice, remotePath, loadFiles]);

  const handleDownload = useCallback(
    async (fileName: string) => {
      if (!selectedDevice) return;
      const savePath = await save({ defaultPath: fileName });
      if (!savePath) return;
      setStatus("正在下载...");
      try {
        await invoke("pull_file", {
          serial: selectedDevice,
          remotePath: remotePath + fileName,
          localPath: savePath,
        });
        setStatus("下载成功: " + savePath);
      } catch (err) {
        setStatus("下载失败: " + String(err));
      }
    },
    [selectedDevice, remotePath]
  );

  const isNotRoot = remotePath !== "/";

  return (
    <div className="files-page">
      <div className="files-header">
        <h2 className="files-title">文件传输</h2>
      </div>

      {/* Controls bar */}
      <div className="files-controls">
        <select
          className="files-select"
          value={selectedDevice}
          onChange={(e) => setSelectedDevice(e.target.value)}
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

        <button
          className="files-btn"
          onClick={handleScreenshot}
          disabled={!selectedDevice}
        >
          截图
        </button>

        <button
          className="files-btn files-btn--secondary"
          onClick={handleUpload}
          disabled={!selectedDevice}
        >
          上传文件
        </button>
      </div>

      {/* Status bar */}
      {status && <div className="files-status">{status}</div>}

      {/* Quick path buttons */}
      <div className="files-quick-paths">
        {QUICK_PATHS.map((qp) => (
          <button
            key={qp.path}
            className={
              "files-quick-btn" +
              (remotePath === qp.path ? " files-quick-btn--active" : "")
            }
            onClick={() => loadFiles(qp.path)}
            disabled={!selectedDevice}
          >
            {qp.label}
          </button>
        ))}
      </div>

      {/* Path input bar */}
      <div className="files-path-bar">
        <input
          className="files-path-input"
          type="text"
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleBrowse();
          }}
          placeholder="输入远程路径..."
        />
        <button
          className="files-btn"
          onClick={handleBrowse}
          disabled={!selectedDevice || loading}
        >
          {loading ? "加载中..." : "浏览"}
        </button>
      </div>

      {/* No device state */}
      {!selectedDevice && (
        <div className="files-empty">请先连接设备</div>
      )}

      {/* File list */}
      {selectedDevice && (
        <div className="files-list">
          {/* ".." entry */}
          {isNotRoot && (
            <div
              className="files-row files-row--dir"
              onClick={() => navigateTo("..")}
            >
              <span className="files-row-icon">[..]</span>
              <span className="files-row-name">..</span>
            </div>
          )}

          {files.map((entry) => (
            <div
              key={entry.name}
              className={
                "files-row" + (entry.isDirectory ? " files-row--dir" : "")
              }
              onClick={
                entry.isDirectory ? () => navigateTo(entry.name) : undefined
              }
            >
              <span className="files-row-icon">
                {entry.isDirectory ? "[D]" : "[F]"}
              </span>
              <span className="files-row-name">{entry.name}</span>
              {!entry.isDirectory && (
                <button
                  className="files-btn files-btn--small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload(entry.name);
                  }}
                >
                  下载
                </button>
              )}
            </div>
          ))}

          {!loading && files.length === 0 && (
            <div className="files-list-empty">目录为空</div>
          )}
        </div>
      )}

      {/* Screenshot preview */}
      {screenshotPath && (
        <div className="files-screenshot-section">
          <h3 className="files-section-title">截图预览</h3>
          <div className="files-screenshot-preview">
            <img
              src={convertFileSrc(screenshotPath)}
              alt="screenshot"
              className="files-screenshot-img"
              onError={(e) => {
                // If convertFileSrc fails to load, fall back to showing path
                (e.target as HTMLImageElement).style.display = "none";
                const parent = (e.target as HTMLImageElement).parentElement;
                if (parent) {
                  const fallback = document.createElement("span");
                  fallback.className = "files-screenshot-fallback";
                  fallback.textContent = screenshotPath;
                  parent.appendChild(fallback);
                }
              }}
            />
          </div>
          <div className="files-screenshot-path">{screenshotPath}</div>
        </div>
      )}
    </div>
  );
}

export default FilesPage;
