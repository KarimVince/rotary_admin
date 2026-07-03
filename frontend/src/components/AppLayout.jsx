import { NavLink, Outlet } from "react-router-dom";
import rotaryLogo from "../assets/rotary-logo.png";
import { useAuth } from "../hooks/useAuth";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", enabled: true },
  { to: "/members", label: "Members", enabled: false },
  { to: "/ngos", label: "NGOs & Donations", enabled: false },
  { to: "/friends", label: "Friends of Rotary", enabled: false },
];

export default function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header">
        <img src={rotaryLogo} alt="Rotary Club of Discovery Bay" className="app-logo" />
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
            <NavLink
              to="/admin/users"
              className={({ isActive }) => (isActive ? "active" : undefined)}
            >
              Manage users
            </NavLink>
          )}
        </nav>
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
