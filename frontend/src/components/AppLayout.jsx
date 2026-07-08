import { NavLink, Outlet, useNavigate } from "react-router-dom";
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
  {
    section: "NGOs & Donations",
    enabled: true,
    children: [
      { to: "/ngos", label: "Organisations", end: true },
      { to: "/ngos/statistics", label: "Statistics" },
    ],
  },
  {
    section: "Friends of Rotary",
    enabled: true,
    children: [
      { to: "/friends", label: "Directory", end: true },
      { to: "/friends/statistics", label: "Statistics" },
      { to: "/friends/email", label: "Send Message", adminOnly: true },
    ],
  },
  {
    section: "Member Fees",
    enabled: true,
    requiredRoles: ["admin", "treasurer"],
    children: [
      { to: "/fees/settings", label: "Fee settings", end: true },
      { to: "/fees/run", label: "Fee run" },
      { to: "/fees/tracking", label: "Fee tracking" },
      { to: "/fees/statistics", label: "Fee statistics" },
    ],
  },
  {
    section: "Admin",
    enabled: true,
    requiredRoles: ["admin", "treasurer"],
    children: [
      { to: "/admin/users", label: "Manage Users", adminOnly: true },
      { to: "/admin/member-titles", label: "Member Titles", adminOnly: true },
      { to: "/admin/currencies", label: "Currencies" },
    ],
  },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <BrandHeader size="small" />
        <button type="button" onClick={handleLogout}>
          Log out
        </button>
      </header>
      <div className="app-body">
        <nav className="app-nav">
          {NAV_ITEMS.map((item) => {
            if (item.children) {
              if (item.requiredRoles && !item.requiredRoles.includes(user?.role)) {
                return null;
              }
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
        </nav>
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
