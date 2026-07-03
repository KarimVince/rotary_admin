import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Dashboard() {
  const { user, logout } = useAuth();

  return (
    <div className="dashboard-page">
      <h1>Dashboard</h1>
      <p>Welcome, {user?.full_name}</p>
      {user?.role === "admin" && <Link to="/admin/users">Manage users</Link>}
      <button type="button" onClick={logout}>
        Log out
      </button>
    </div>
  );
}
