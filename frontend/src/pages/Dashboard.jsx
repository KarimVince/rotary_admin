import { useEffect, useState } from "react";
import { fetchDashboardSummary } from "../api/dashboard";
import { useAuth } from "../hooks/useAuth";

const formatEuros = (value) =>
  `${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} €`;

const STAT_CARDS = [
  { key: "active_members", label: "Active members" },
  { key: "organisations_supported", label: "NGOs supported" },
  { key: "rotary_friends", label: "Friends of Rotary" },
  { key: "donations_this_year", label: "Donations this rotary year", format: formatEuros },
];

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDashboardSummary()
      .then(setSummary)
      .catch((err) => setError(err.detail || "Failed to load dashboard summary"));
  }, []);

  return (
    <div className="dashboard-page">
      <h1>Welcome, {user?.full_name}</h1>
      {error && <p role="alert">{error}</p>}
      <div className="stat-cards">
        {STAT_CARDS.map((card) => (
          <div className="stat-card" key={card.key}>
            <span className="stat-value">
              {summary
                ? card.format
                  ? card.format(summary[card.key])
                  : summary[card.key]
                : "–"}
            </span>
            <span className="stat-label">{card.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
