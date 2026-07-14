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
import { fetchCurrentPptTemplate } from "../api/pptTemplates";
import { useAccess } from "../hooks/useAccess";

const PIE_COLORS = ["#17458f", "#f7a81b", "#5f55ee", "#0f9d9f", "#b3261e", "#9aa4b2"];

// Story 8.23: "remembered per session (not persisted across logins)" —
// sessionStorage survives navigating away and back within the same browser
// tab session, but not a fresh login/tab, unlike localStorage or a cookie.
const SESSION_KEY_REPORT_TYPE = "membersStats.reportType";
const SESSION_KEY_USE_TEMPLATE = "membersStats.useTemplate";

export default function MembersStatistics() {
  const { canRead } = useAccess("members.statistics");
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [reportFormat, setReportFormat] = useState("pdf");
  const [reportType, setReportType] = useState(
    () => sessionStorage.getItem(SESSION_KEY_REPORT_TYPE) || "simplified",
  );
  const [useTemplate, setUseTemplate] = useState(
    () => sessionStorage.getItem(SESSION_KEY_USE_TEMPLATE) === "true",
  );
  const [hasTemplate, setHasTemplate] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState(null);

  useEffect(() => {
    if (!canRead) return;
    fetchMemberStatistics()
      .then(setStats)
      .catch((err) => setError(err.detail || "Failed to load statistics"));
    fetchCurrentPptTemplate()
      .then((template) => setHasTemplate(Boolean(template)))
      .catch(() => {
        // Non-fatal — the template checkbox just stays disabled as if none
        // were uploaded (e.g. the user has no admin.ppt_template access).
      });
  }, [canRead]);

  function handleReportTypeChange(value) {
    setReportType(value);
    sessionStorage.setItem(SESSION_KEY_REPORT_TYPE, value);
  }

  function handleUseTemplateChange(checked) {
    setUseTemplate(checked);
    sessionStorage.setItem(SESSION_KEY_USE_TEMPLATE, String(checked));
  }

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>Member statistics</h1>
        <p role="alert">You do not have permission to view Member statistics.</p>
      </div>
    );
  }

  async function handleGenerateReport() {
    setIsGeneratingReport(true);
    setReportError(null);
    try {
      const { blob, filename } = await generateStatisticsReport(reportFormat, {
        reportType,
        useTemplate: useTemplate && reportFormat === "pptx" && hasTemplate,
      });
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
    <div className="admin-page admin-page-wide">
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

        <label htmlFor="report-type">Content</label>
        <select
          id="report-type"
          value={reportType}
          onChange={(event) => handleReportTypeChange(event.target.value)}
          disabled={isGeneratingReport}
        >
          <option value="simplified">Simplified</option>
          <option value="integral">Integral</option>
        </select>

        <label
          htmlFor="report-use-template"
          title={
            reportFormat !== "pptx"
              ? "The annual club template only applies to PowerPoint (PPTX) reports"
              : !hasTemplate
                ? "No annual template uploaded yet. Go to Admin → PPT Template to upload one."
                : undefined
          }
        >
          <input
            id="report-use-template"
            type="checkbox"
            checked={useTemplate}
            onChange={(event) => handleUseTemplateChange(event.target.checked)}
            disabled={isGeneratingReport || reportFormat !== "pptx" || !hasTemplate}
          />
          Use annual club template
        </label>

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
