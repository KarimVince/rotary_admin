import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchRotaryFriendStatistics } from "../api/rotaryFriends";

const PIE_COLORS = ["#17458f", "#f7a81b", "#5f55ee", "#0f9d9f", "#b3261e", "#9aa4b2"];

export default function RotaryFriendsStatistics() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchRotaryFriendStatistics()
      .then(setStats)
      .catch((err) => setError(err.detail || "Failed to load statistics"));
  }, []);

  if (error) {
    return (
      <div className="admin-page">
        <h1>Rotary Friends statistics</h1>
        <p role="alert">{error}</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="admin-page">
        <h1>Rotary Friends statistics</h1>
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <h1>Rotary Friends statistics</h1>

      <div className="stat-cards-row-3">
        <div className="stat-card stat-card-blue">
          <span className="stat-value">{stats.total_friends}</span>
          <span className="stat-label">Total Friends</span>
        </div>
      </div>

      {stats.total_friends === 0 ? (
        <p className="member-empty-state">No Rotary Friends recorded yet.</p>
      ) : (
        <div className="chart-grid">
          <div className="chart-card">
            <h2>By source</h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={stats.by_source}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" name="Friends" fill="#17458f" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <h2>By tag</h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={stats.by_tag}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" name="Friends" fill="#0f9d9f" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <h2>Contactability</h2>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={stats.contactability}
                  dataKey="value"
                  nameKey="label"
                  outerRadius={80}
                  label={(entry) => entry.label}
                >
                  {stats.contactability.map((entry, index) => (
                    <Cell key={entry.label} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
