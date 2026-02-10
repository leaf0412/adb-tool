import { NavLink, Outlet } from "react-router-dom";
import "./Layout.css";

const navItems = [
  { to: "/", label: "设备管理" },
  { to: "/install", label: "安装 APK" },
  { to: "/apps", label: "应用管理" },
  { to: "/logcat", label: "日志查看" },
  { to: "/files", label: "文件传输" },
  { to: "/oplog", label: "操作记录" },
];

function Layout() {
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
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
