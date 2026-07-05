import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import BrandHeader from "./BrandHeader";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", enabled: true },
  {
    section: "Members",
    enabled: true,
    children: [
      { to: "/members", label: "Directory", end: true },
      { to: "/members/statistics", label: "Statistics" },
      { to: "/members/email", label: "Email Members", adminOnly: true },
    ],
  },
  { to: "/ngos", label: "NGOs & Donations", enabled: false },
  { to: "/friends", label: "Friends of Rotary", enabled: false },
];

export default function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header">
        <BrandHeader size="small" />
        <button type="button" onClick={logout}>
          Log out
        </button>
      </header>
      <div className="app-body">
        <nav className="app-nav">
          {NAV_ITEMS.map((item) => {
            if (item.children) {
              return (
                <div key={item.section} className="nav-section">
                  <span className="nav-section-title">{item.section}</span>
                  {item.children
                    .filter((child) => !child.adminOnly || user?.role === "admin")
                    .map((child) => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        end={child.end}
                        className={({ isActive }) => `nav-subitem${isActive ? " active" : ""}`}
                      >
                        {child.label}
                      </NavLink>
                    ))}
                </div>
              );
            }
            return item.enabled ? (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? "active" : undefined)}
              >
                {item.label}
              </NavLink>
            ) : (
              <span key={item.to} className="nav-locked" title="Coming soon">
                {item.label}
              </span>
            );
          })}
          {user?.role === "admin" && (
            <>
              <NavLink
                to="/admin/users"
                className={({ isActive }) => (isActive ? "active" : undefined)}
              >
                Manage users
              </NavLink>
              <NavLink
                to="/admin/member-titles"
                className={({ isActive }) => (isActive ? "active" : undefined)}
              >
                Member titles
              </NavLink>
            </>
          )}
        </nav>
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
