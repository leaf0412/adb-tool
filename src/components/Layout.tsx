import { NavLink, useLocation } from "react-router-dom";
import { useRef } from "react";
import { useDevices } from "../hooks/useDevices";
import { useUpdate } from "../hooks/useUpdate";
import DevicesPage from "../pages/DevicesPage";
import InstallPage from "../pages/InstallPage";
import AppsPage from "../pages/AppsPage";
import LogcatPage from "../pages/LogcatPage";
import FilesPage from "../pages/FilesPage";
import OpLogPage from "../pages/OpLogPage";
import AboutPage from "../pages/AboutPage";
import "./Layout.css";

const navItems = [
  { to: "/", label: "设备管理" },
  { to: "/install", label: "安装 APK" },
  // { to: "/apps", label: "应用管理" },
  { to: "/logcat", label: "日志查看" },
  { to: "/files", label: "文件传输" },
  { to: "/oplog", label: "操作记录" },
];

const pages: { path: string; component: React.ReactNode }[] = [
  { path: "/", component: <DevicesPage /> },
  { path: "/install", component: <InstallPage /> },
  { path: "/apps", component: <AppsPage /> },
  { path: "/logcat", component: <LogcatPage /> },
  { path: "/files", component: <FilesPage /> },
  { path: "/oplog", component: <OpLogPage /> },
  { path: "/about", component: <AboutPage /> },
];

function Layout() {
  const { pathname } = useLocation();
  const { devices } = useDevices();
  const { status, updateInfo, progress, download, install, dismiss } = useUpdate();
  const visited = useRef(new Set<string>([pathname]));
  visited.current.add(pathname);

  const unauthorizedDevices = devices.filter((d) => d.state === "unauthorized");

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-title">ADB Tool</div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                "nav-item" + (isActive ? " nav-item--active" : "")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        {status === "downloading" && progress && (
          <div className="sidebar-update-progress">
            <div className="sidebar-progress-text">
              更新中 {Math.round(progress.percent)}%
            </div>
            <div className="sidebar-progress-bar">
              <div
                className="sidebar-progress-fill"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}
        <NavLink
          to="/about"
          className={({ isActive }) =>
            "nav-item sidebar-about" + (isActive ? " nav-item--active" : "")
          }
        >
          关于
        </NavLink>
      </aside>
      <main className="content">
        {unauthorizedDevices.length > 0 && (
          <div className="layout-unauthorized-banner">
            <span className="layout-unauthorized-icon">!</span>
            <span>
              检测到 {unauthorizedDevices.length} 台未授权设备，请在设备上确认「允许 USB 调试」
            </span>
          </div>
        )}
        {pages.map(({ path, component }) => {
          if (!visited.current.has(path)) return null;
          return (
            <div
              key={path}
              style={{ display: pathname === path ? undefined : "none" }}
            >
              {component}
            </div>
          );
        })}
      </main>

      {/* Update available dialog */}
      {status === "available" && updateInfo && (
        <div className="update-confirm-overlay">
          <div className="update-confirm-dialog">
            <div className="update-confirm-title">
              发现新版本 v{updateInfo.version}
            </div>
            {updateInfo.body && (
              <div className="update-confirm-body">{updateInfo.body}</div>
            )}
            <div className="update-confirm-actions">
              <button
                className="update-confirm-btn update-confirm-btn--cancel"
                onClick={dismiss}
              >
                稍后提醒
              </button>
              <button
                className="update-confirm-btn update-confirm-btn--primary"
                onClick={download}
              >
                立即更新
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restart prompt dialog */}
      {status === "ready" && (
        <div className="update-confirm-overlay">
          <div className="update-confirm-dialog">
            <div className="update-confirm-title">更新已下载完成</div>
            <div className="update-confirm-body">
              重启应用以完成安装
            </div>
            <div className="update-confirm-actions">
              <button
                className="update-confirm-btn update-confirm-btn--cancel"
                onClick={dismiss}
              >
                稍后重启
              </button>
              <button
                className="update-confirm-btn update-confirm-btn--primary"
                onClick={install}
              >
                立即重启
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Layout;
