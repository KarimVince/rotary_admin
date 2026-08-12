import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchRotaryFriendStatistics, generateRotaryFriendStatisticsReport } from "../api/rotaryFriends";
import { fetchCurrentPptTemplate } from "../api/pptTemplates";
import Card from "../components/Card";
import SingleSelectDropdown from "../components/SingleSelectDropdown";
import { useAccess } from "../hooks/useAccess";

const PIE_COLORS = ["var(--rotary-blue)", "var(--rotary-gold)", "#5f55ee", "#0f9d9f", "#b3261e", "#9aa4b2"];

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
      <p className="mt-1 mb-5 text-sm text-[var(--color-muted-text)]">
        Sources, tags and contactability of friends.
      </p>

      <div className="mb-5 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="pl-0.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]">
              Format
            </span>
            <SingleSelectDropdown
              ariaLabel="Format"
              minWidthClass="min-w-[170px]"
              disabled={isGeneratingReport}
              value={reportFormat}
              options={[
                { value: "pdf", label: "PDF" },
                { value: "pptx", label: "PowerPoint (PPTX)" },
              ]}
              onSelect={setReportFormat}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="pl-0.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]">
              Content
            </span>
            <SingleSelectDropdown
              ariaLabel="Content"
              minWidthClass="min-w-[130px]"
              disabled={isGeneratingReport}
              value={reportType}
              options={[
                { value: "simplified", label: "Simplified" },
                { value: "integral", label: "Integral" },
              ]}
              onSelect={handleReportTypeChange}
            />
          </div>

          <label
            htmlFor="report-use-template"
            className="flex h-[38px] items-center gap-2 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]"
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

          <div className="ml-auto flex flex-col gap-1.5">
            <span className="pl-0.5 text-[11px]">&nbsp;</span>
            <button
              type="button"
              onClick={handleGenerateReport}
              disabled={isGeneratingReport}
              className="inline-flex h-[38px] items-center gap-2 rounded-[8px] border border-[var(--border)] bg-transparent px-4 text-[13px] font-semibold text-[var(--ink-2)] hover:bg-[var(--bg-alt)] disabled:opacity-50"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              {isGeneratingReport ? "Generating…" : "Generate Report"}
            </button>
          </div>
          {reportError && (
            <p role="alert" className="w-full text-[13px] text-[var(--low)]">
              {reportError}
            </p>
          )}
        </div>

      <div className="mb-4 grid grid-cols-1 sm:max-w-[280px] stat-duo-grid">
        <Card variant="stat-blue" className="flex flex-col">
          <span className="text-3xl font-bold">{stats.total_friends}</span>
          <span className="mt-2 text-sm">Total Friends</span>
        </Card>
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
                <Bar dataKey="value" name="Friends" fill="var(--rotary-blue)" />
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
