import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchMemberStatistics } from "../api/memberStatistics";

const PIE_COLORS = ["#17458f", "#f7a81b", "#5f55ee", "#0f9d9f", "#b3261e", "#9aa4b2"];

export default function MembersStatistics() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchMemberStatistics()
      .then(setStats)
      .catch((err) => setError(err.detail || "Failed to load statistics"));
  }, []);

  if (error) {
    return (
      <div className="admin-page">
        <h1>Member statistics</h1>
        <p role="alert">{error}</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="admin-page">
        <h1>Member statistics</h1>
        <p>Loading…</p>
      </div>
    );
  }

  const activeCount = stats.by_status.find((entry) => entry.label === "active")?.value ?? 0;
  const pastCount = stats.by_status.find((entry) => entry.label === "past")?.value ?? 0;

  return (
    <div className="admin-page">
      <h1>Member statistics</h1>

      <div className="stat-cards">
        <div className="stat-card">
          <span className="stat-value">{activeCount}</span>
          <span className="stat-label">Active members</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{pastCount}</span>
          <span className="stat-label">Past members</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{stats.average_tenure_years ?? "–"}</span>
          <span className="stat-label">Average tenure (years)</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{stats.average_age ?? "–"}</span>
          <span className="stat-label">Average age</span>
        </div>
      </div>

      <div className="chart-grid">
        <div className="chart-card">
          <h2>Members by join year</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={stats.by_join_year}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" name="Members" fill="#17458f" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h2>Growth by Rotary year (joins vs leaves)</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={stats.growth_by_rotary_year}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="joins" name="Joins" fill="#17458f" />
              <Bar dataKey="leaves" name="Leaves" fill="#b3261e" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h2>Nationality distribution</h2>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={stats.by_nationality}
                dataKey="value"
                nameKey="label"
                outerRadius={80}
                label={(entry) => entry.label}
              >
                {stats.by_nationality.map((entry, index) => (
                  <Cell key={entry.label} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h2>Classification distribution</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={stats.by_classification} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="label" width={120} />
              <Tooltip />
              <Bar dataKey="value" name="Members" fill="#17458f" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h2>Age distribution</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={stats.age_distribution}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" name="Members" fill="#17458f" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
