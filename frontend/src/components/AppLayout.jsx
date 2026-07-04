import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import BrandHeader from "./BrandHeader";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", enabled: true },
  { to: "/members", label: "Members", enabled: true },
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
          {NAV_ITEMS.map((item) =>
            item.enabled ? (
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
            ),
          )}
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
