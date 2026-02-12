import { useState, useEffect, useCallback } from "react";
import { bridge } from "../bridge";
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
  { label: "截图", path: ["/sdcard/DCIM/Screenshots/", "/sdcard/Pictures/Screenshots/", "/sdcard/Screenshots/"] },
  { label: "录屏", path: ["/sdcard/DCIM/ScreenRecorder/", "/sdcard/Movies/", "/sdcard/DCIM/ScreenRecords/"] },
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
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

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
        const lines = await bridge().listRemoteFiles(selectedDevice, dir);
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

  // Try multiple paths in order, use first one that has files
  const loadFilesWithFallback = useCallback(
    async (paths: string[]) => {
      if (!selectedDevice) return;
      setLoading(true);
      setStatus("");
      for (const path of paths) {
        try {
          const lines = await bridge().listRemoteFiles(selectedDevice, path);
          if (lines.length === 0) continue;
          const entries: FileEntry[] = [];
          for (const line of lines) {
            const entry = parseLsLine(line);
            if (entry) entries.push(entry);
          }
          entries.sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
          setFiles(entries);
          setRemotePath(path);
          setPathInput(path);
          setLoading(false);
          return;
        } catch {
          // Try next path
        }
      }
      setStatus("目录不存在");
      setFiles([]);
      setLoading(false);
    },
    [selectedDevice]
  );

  const handleBrowse = useCallback(() => {
    let path = pathInput.trim();
    if (!path) return;
    if (!path.endsWith("/")) path += "/";
    loadFiles(path);
  }, [pathInput, loadFiles]);

  const handleScreenshot = useCallback(async () => {
    if (!selectedDevice) return;
    const savePath = await bridge().showSaveDialog({
      defaultPath: `screenshot_${Date.now()}.png`,
      filters: [{ name: "Image", extensions: ["png"] }],
    });
    if (!savePath) return;
    setStatus("正在截图...");
    try {
      await bridge().takeScreenshot(selectedDevice, savePath);
      setStatus("截图已保存: " + savePath);
    } catch (err) {
      setStatus("截图失败: " + String(err));
    }
  }, [selectedDevice]);

  const handleUpload = useCallback(async () => {
    if (!selectedDevice) return;
    const file = await bridge().showOpenDialog();
    if (!file) return;
    setStatus("正在上传...");
    try {
      const fileName =
        file.split("/").pop() || file.split("\\").pop() || "file";
      await bridge().pushFile(selectedDevice, file, remotePath + fileName);
      setStatus("上传成功: " + fileName);
      loadFiles();
    } catch (err) {
      setStatus("上传失败: " + String(err));
    }
  }, [selectedDevice, remotePath, loadFiles]);

  const handleDownload = useCallback(
    async (fileName: string) => {
      if (!selectedDevice) return;
      const savePath = await bridge().showSaveDialog({ defaultPath: fileName });
      if (!savePath) return;
      setStatus("正在下载...");
      try {
        await bridge().pullFile(selectedDevice, remotePath + fileName, savePath);
        setStatus("下载成功: " + savePath);
      } catch (err) {
        setStatus("下载失败: " + String(err));
      }
    },
    [selectedDevice, remotePath]
  );

  const handleDelete = useCallback(
    async (fileName: string) => {
      if (!selectedDevice) return;
      setStatus("正在删除...");
      setDeleteTarget(null);
      try {
        await bridge().deleteRemoteFile(
          selectedDevice,
          remotePath + fileName,
        );
        setStatus("已删除: " + fileName);
        loadFiles();
      } catch (err) {
        setStatus("删除失败: " + String(err));
      }
    },
    [selectedDevice, remotePath, loadFiles],
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
        {QUICK_PATHS.map((qp) => {
          const paths = Array.isArray(qp.path) ? qp.path : [qp.path];
          const isActive = paths.includes(remotePath);
          return (
            <button
              key={qp.label}
              className={
                "files-quick-btn" +
                (isActive ? " files-quick-btn--active" : "")
              }
              onClick={() =>
                Array.isArray(qp.path)
                  ? loadFilesWithFallback(qp.path)
                  : loadFiles(qp.path)
              }
              disabled={!selectedDevice}
            >
              {qp.label}
            </button>
          );
        })}
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
                <div className="files-row-actions">
                  <button
                    className="files-btn files-btn--small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(entry.name);
                    }}
                  >
                    下载
                  </button>
                  <button
                    className="files-btn files-btn--small files-btn--danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(entry.name);
                    }}
                  >
                    删除
                  </button>
                </div>
              )}
            </div>
          ))}

          {!loading && files.length === 0 && (
            <div className="files-list-empty">目录为空</div>
          )}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div
          className="files-confirm-overlay"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="files-confirm-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="files-confirm-message">
              确定要删除文件「{deleteTarget}」吗？
            </p>
            <div className="files-confirm-actions">
              <button
                className="files-confirm-btn files-confirm-btn--cancel"
                onClick={() => setDeleteTarget(null)}
              >
                取消
              </button>
              <button
                className="files-confirm-btn files-confirm-btn--danger"
                onClick={() => handleDelete(deleteTarget)}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default FilesPage;
