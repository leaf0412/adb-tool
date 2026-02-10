import { NavLink, useLocation } from "react-router-dom";
import { useRef } from "react";
import DevicesPage from "../pages/DevicesPage";
import InstallPage from "../pages/InstallPage";
import AppsPage from "../pages/AppsPage";
import LogcatPage from "../pages/LogcatPage";
import FilesPage from "../pages/FilesPage";
import OpLogPage from "../pages/OpLogPage";
import "./Layout.css";

const navItems = [
  { to: "/", label: "设备管理" },
  { to: "/install", label: "安装 APK" },
  { to: "/apps", label: "应用管理" },
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
];

function Layout() {
  const { pathname } = useLocation();
  // Track which pages have been visited so we only mount on first visit
  const visited = useRef(new Set<string>([pathname]));
  visited.current.add(pathname);

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
      </aside>
      <main className="content">
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
    </div>
  );
}

export default Layout;
