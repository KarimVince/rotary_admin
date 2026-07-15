import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchRotaryFriendStatistics, generateRotaryFriendStatisticsReport } from "../api/rotaryFriends";
import { fetchCurrentPptTemplate } from "../api/pptTemplates";
import { useAccess } from "../hooks/useAccess";

const PIE_COLORS = ["#17458f", "#f7a81b", "#5f55ee", "#0f9d9f", "#b3261e", "#9aa4b2"];

const SESSION_KEY_REPORT_TYPE = "friendsStats.reportType";
const SESSION_KEY_USE_TEMPLATE = "friendsStats.useTemplate";

export default function RotaryFriendsStatistics() {
  const { canRead } = useAccess("friends.statistics");
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

  function handleReportTypeChange(value) {
    setReportType(value);
    sessionStorage.setItem(SESSION_KEY_REPORT_TYPE, value);
  }

  function handleUseTemplateChange(checked) {
    setUseTemplate(checked);
    sessionStorage.setItem(SESSION_KEY_USE_TEMPLATE, String(checked));
  }

  async function handleGenerateReport() {
    setIsGeneratingReport(true);
    setReportError(null);
    try {
      const { blob, filename } = await generateRotaryFriendStatisticsReport(reportFormat, {
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

  useEffect(() => {
    if (!canRead) return;
    fetchRotaryFriendStatistics()
      .then(setStats)
      .catch((err) => setError(err.detail || "Failed to load statistics"));
    fetchCurrentPptTemplate()
      .then((template) => setHasTemplate(Boolean(template)))
      .catch(() => {
        // non-fatal — checkbox stays disabled
      });
  }, [canRead]);

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>Rotary Friends statistics</h1>
        <p role="alert">You do not have permission to view Friends of Rotary.</p>
      </div>
    );
  }

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
    <div className="admin-page admin-page-wide">
      <h1>Rotary Friends statistics</h1>

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
