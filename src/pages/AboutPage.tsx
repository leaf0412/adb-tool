import { useUpdate } from "../hooks/useUpdate";
import "./AboutPage.css";

function AboutPage() {
  const { status, updateInfo, progress, error, appVersion, check, download, install } =
    useUpdate();

  return (
    <div className="about-page">
      <div className="about-app-info">
        <div className="about-app-name">ADB Tool</div>
        <div className="about-app-version">v{appVersion}</div>
      </div>

      <div className="about-update-section">
        {status === "idle" && (
          <div className="about-update-status">当前已是最新版本</div>
        )}
        {status === "checking" && (
          <div className="about-update-status">正在检查更新…</div>
        )}
        {status === "available" && updateInfo && (
          <div className="about-update-status about-update-status--available">
            发现新版本 v{updateInfo.version}
          </div>
        )}
        {status === "downloading" && (
          <>
            <div className="about-update-status">正在下载更新…</div>
            <div className="about-progress-bar">
              <div
                className="about-progress-fill"
                style={{ width: `${progress?.percent ?? 0}%` }}
              />
            </div>
            <div className="about-progress-text">
              {Math.round(progress?.percent ?? 0)}%
            </div>
          </>
        )}
        {status === "ready" && (
          <div className="about-update-status about-update-status--available">
            下载完成，重启以完成安装
          </div>
        )}
        {status === "error" && (
          <div className="about-update-status about-update-status--error">
            {error || "检查更新失败"}
          </div>
        )}

        {status === "idle" && (
          <button className="about-btn" onClick={check}>
            检查更新
          </button>
        )}
        {status === "available" && (
          <button className="about-btn" onClick={download}>
            立即更新
          </button>
        )}
        {status === "ready" && (
          <button className="about-btn" onClick={install}>
            立即重启
          </button>
        )}
        {status === "error" && (
          <button className="about-btn" onClick={check}>
            重新检查
          </button>
        )}
      </div>

      <div className="about-links">
        <a
          className="about-link"
          href="https://github.com/leaf0412/adb-tool"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
      </div>
    </div>
  );
}

export default AboutPage;
