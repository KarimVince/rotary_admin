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
import { fetchMemberStatistics, generateStatisticsReport } from "../api/memberStatistics";

const PIE_COLORS = ["#17458f", "#f7a81b", "#5f55ee", "#0f9d9f", "#b3261e", "#9aa4b2"];

export default function MembersStatistics() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [reportFormat, setReportFormat] = useState("pdf");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState(null);

  useEffect(() => {
    fetchMemberStatistics()
      .then(setStats)
      .catch((err) => setError(err.detail || "Failed to load statistics"));
  }, []);

  async function handleGenerateReport() {
    setIsGeneratingReport(true);
    setReportError(null);
    try {
      const { blob, filename } = await generateStatisticsReport(reportFormat);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setReportError(err.detail || "Failed to generate report");
    } finally {
      setIsGeneratingReport(false);
    }
  }

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

  return (
    <div className="admin-page">
      <h1>Member statistics</h1>

      <div className="report-controls">
        <label htmlFor="report-format">Generate report</label>
        <select
          id="report-format"
          value={reportFormat}
          onChange={(event) => setReportFormat(event.target.value)}
          disabled={isGeneratingReport}
        >
          <option value="pdf">PDF</option>
          <option value="pptx">PowerPoint (PPTX)</option>
        </select>
        <button type="button" onClick={handleGenerateReport} disabled={isGeneratingReport}>
          {isGeneratingReport ? "Generating…" : "Generate Report"}
        </button>
        {reportError && <p role="alert">{reportError}</p>}
      </div>

      <div className="stat-cards-row">
        <div className="stat-card stat-card-blue">
          <span className="stat-value">{stats.total_members}</span>
          <span className="stat-label">Total Members</span>
        </div>
        <div className="stat-card stat-card-blue">
          <span className="stat-value">{stats.honorary_members}</span>
          <span className="stat-label">Honorary Members</span>
        </div>
        <div className="stat-card stat-card-lavender">
          <span className="stat-value">{stats.new_members_this_rotary_year}</span>
          <span className="stat-label">New Members (this Rotary year)</span>
        </div>
        <div className="stat-card stat-card-lavender">
          <span className="stat-value">{stats.countries_represented}</span>
          <span className="stat-label">Countries Represented</span>
        </div>
      </div>

      <div className="stat-cards-row">
        <div className="stat-card stat-card-teal">
          <span className="stat-value">{stats.women_count}</span>
          <span className="stat-label">Number of Women</span>
        </div>
        <div className="stat-card stat-card-teal">
          <span className="stat-value">{stats.men_count}</span>
          <span className="stat-label">Number of Men</span>
        </div>
        <div className="stat-card stat-card-amber">
          <span className="stat-value">{stats.average_age ?? "–"}</span>
          <span className="stat-label">Average Age</span>
        </div>
        <div className="stat-card stat-card-amber">
          <span className="stat-value">{stats.average_tenure_as_rotarian ?? "–"}</span>
          <span className="stat-label">Average Tenure (as Rotarian)</span>
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
          <h2>Tenure distribution (years as Rotarian)</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={stats.tenure_distribution}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" name="Members" fill="#17458f" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h2>Gender distribution</h2>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={stats.by_gender}
                dataKey="value"
                nameKey="label"
                outerRadius={80}
                label={(entry) => entry.label}
              >
                {stats.by_gender.map((entry, index) => (
                  <Cell key={entry.label} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
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
