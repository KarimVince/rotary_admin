import { useEffect, useState } from "react";
import { Download } from "lucide-react";
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
import Card from "../components/Card";
import SectionLabel from "../components/SectionLabel";
import SingleSelectDropdown from "../components/SingleSelectDropdown";
import { useAccess } from "../hooks/useAccess";

const PIE_COLORS = ["var(--rotary-blue)", "var(--rotary-gold)", "#5f55ee", "#0f9d9f", "#b3261e", "#9aa4b2"];

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

  // Row 1: CP name | Total Members | Honorary Members | New Members This Year
  // Row 2: Charter Members | Past Presidents in club | Members <35 | Countries
  // Row 3: Women | Men | Avg Age | Avg Tenure
  const STAT_ROW_1 = [
    { key: "total_members", value: stats.total_members, label: "Total Members", tone: "stat-blue" },
    { key: "honorary_members", value: stats.honorary_members, label: "Honorary Members", tone: "stat-blue" },
    {
      key: "new_members_this_rotary_year",
      value: stats.new_members_this_rotary_year,
      label: "New Members (this Rotary year)",
      tone: "stat-lavender",
    },
  ];
  const STAT_ROW_2 = [
    { key: "charter_members_count", value: stats.charter_members_count, label: "Charter Members", tone: "stat-amber" },
    {
      key: "past_presidents_in_club_count",
      value: stats.past_presidents_in_club_count,
      label: "Past Presidents in Club",
      tone: "stat-amber",
    },
    { key: "members_under_35_count", value: stats.members_under_35_count, label: "Members Under 35", tone: "stat-green" },
    { key: "countries_represented", value: stats.countries_represented, label: "Countries Represented", tone: "stat-lavender" },
  ];
  const _pct = (count) =>
    stats.total_members > 0 ? `${Math.round((count / stats.total_members) * 100)}%` : "—";
  const STAT_ROW_3 = [
    { key: "women_count", value: stats.women_count, subtitle: _pct(stats.women_count), label: "Number of Women", tone: "stat-teal" },
    { key: "men_count", value: stats.men_count, subtitle: _pct(stats.men_count), label: "Number of Men", tone: "stat-teal" },
    { key: "average_age", value: stats.average_age ?? "–", label: "Average Age", tone: "stat-amber" },
    { key: "average_tenure_as_rotarian", value: stats.average_tenure_as_rotarian ?? "–", label: "Avg Tenure as Rotarian", tone: "stat-amber" },
  ];

  return (
    <div className="admin-page admin-page-wide">
      <h1>Member statistics</h1>
      <p className="mt-1 mb-5 text-sm text-[var(--color-muted-text)]">
        Composition of the club membership.
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
            className="flex h-[38px] items-center gap-2 text-[13px] text-[var(--ink-2)]"
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

      {/* Row 1: CP name card + 3 headline stats */}
      <div className="stat-duo-grid mb-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card variant="stat-amber" className="flex flex-col">
          <div className="flex items-baseline justify-between gap-2 min-w-0 overflow-hidden">
            <span className="text-xl font-bold leading-tight truncate" title={stats.charter_president_name ?? undefined}>
              {stats.charter_president_name ?? "—"}
            </span>
          </div>
          <span className="mt-2 text-sm">Charter President</span>
        </Card>
        {STAT_ROW_1.map((card) => (
          <Card key={card.key} variant={card.tone} className="flex flex-col">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-3xl font-bold">{card.value}</span>
            </div>
            <span className="mt-2 text-sm">{card.label}</span>
          </Card>
        ))}
      </div>

      {/* Row 2: Charter / Past Presidents / Under-35 / Countries */}
      <div className="stat-duo-grid mb-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        {STAT_ROW_2.map((card) => (
          <Card key={card.key} variant={card.tone} className="flex flex-col">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-3xl font-bold">{card.value}</span>
            </div>
            <span className="mt-2 text-sm">{card.label}</span>
          </Card>
        ))}
      </div>

      {/* Row 3: Gender / Age / Tenure */}
      <div className="stat-duo-grid mb-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        {STAT_ROW_3.map((card) => (
          <Card key={card.key} variant={card.tone} className="flex flex-col">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-3xl font-bold">{card.value}</span>
              {card.subtitle && (
                <span className="text-base font-semibold text-[var(--faint)]">{card.subtitle}</span>
              )}
            </div>
            <span className="mt-2 text-sm">{card.label}</span>
          </Card>
        ))}
      </div>

      <SectionLabel className="mt-2">Breakdowns</SectionLabel>

      <div className="chart-grid">
        <div className="chart-card">
          <h2>Members by join year</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={stats.by_join_year}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" name="Members" fill="var(--rotary-blue)" />
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
              <Bar dataKey="joins" name="Joins" fill="var(--rotary-blue)" />
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
              <Bar dataKey="value" name="Members" fill="var(--rotary-blue)" />
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
              <Bar dataKey="value" name="Members" fill="var(--rotary-blue)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
