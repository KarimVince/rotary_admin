import { useEffect, useMemo, useState } from "react";
import { Calendar, Download } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchDonationStatistics, generateDonationStatisticsReport } from "../api/donations";
import Card from "../components/Card";
import SingleSelectDropdown from "../components/SingleSelectDropdown";
import { useAccess } from "../hooks/useAccess";
import { useRotaryYears } from "../hooks/useRotaryYears";
import { rotaryYearLabel } from "../utils/rotaryYear";
import { currencyLabel } from "../data/currencies";

function formatCurrency(value, currency) {
  return `${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} ${currency}`;
}

const SESSION_KEY_USE_TEMPLATE   = "ngoStats.useTemplate";
const SESSION_KEY_REPORT_FORMAT  = "ngoStats.reportFormat";

const STAT_VARIANTS = ["stat-blue", "stat-lavender", "stat-teal", "stat-amber"];

export default function DonationsStatistics() {
  const { canRead } = useAccess("ngos.statistics");
  const { yearOptions, currentYear, selectedYear, setSelectedYear } = useRotaryYears();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [selectedCurrency, setSelectedCurrency] = useState(null);
  const [reportFormat, setReportFormat] = useState(
    () => sessionStorage.getItem(SESSION_KEY_REPORT_FORMAT) || "pdf",
  );
  const [useTemplate, setUseTemplate] = useState(
    () => sessionStorage.getItem(SESSION_KEY_USE_TEMPLATE) === "true",
  );
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState(null);

  function handleUseTemplateChange(checked) {
    setUseTemplate(checked);
    sessionStorage.setItem(SESSION_KEY_USE_TEMPLATE, String(checked));
  }

  function handleReportFormatChange(value) {
    setReportFormat(value);
    sessionStorage.setItem(SESSION_KEY_REPORT_FORMAT, value);
  }

  async function handleGenerateReport() {
    setIsGeneratingReport(true);
    setReportError(null);
    try {
      let blob, filename;
      if (reportFormat === "pdf") {
        ({ blob, filename } = await generateDonationStatisticsReport("pdf", {
          reportType: "project-services",
          rotaryYear: selectedYear,
          currency: selectedCurrency,
        }));
      } else {
        ({ blob, filename } = await generateDonationStatisticsReport("pptx", {
          reportType: "simplified",
          useTemplate,
          rotaryYear: selectedYear,
          currency: selectedCurrency,
        }));
      }
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
    fetchDonationStatistics({ rotary_year: selectedYear })
      .then((data) => {
        setStats(data);
        setSelectedCurrency((current) => current ?? data.by_currency[0]?.currency ?? null);
      })
      .catch((err) => setError(err.detail || "Failed to load donation statistics"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead, selectedYear]);

  const currentStats = useMemo(
    () => stats?.by_currency.find((block) => block.currency === selectedCurrency) ?? null,
    [stats, selectedCurrency],
  );

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>Donation statistics</h1>
        <p role="alert">You do not have permission to view Donation statistics.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-page">
        <h1>Donation statistics</h1>
        <p role="alert">{error}</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="admin-page">
        <h1>Donation statistics</h1>
        <p>Loading…</p>
      </div>
    );
  }

  // Story 8.26: a selected classification (or the current filter combo) can
  // legitimately have zero matching donations — that must never blank the
  // whole page (title/report card/selectors). Every derived value below
  // falls back to an empty array instead of reading off a null currentStats,
  // and each chart/card renders its own empty state instead of the page
  // bailing out early.
  // Story 8.30: "Total donated per rotary year" and "Year-over-year trend"
  // are inherently multi-year charts already (never filtered by the year
  // selector on the backend — see total_by_rotary_year), so they only render
  // in the "All Years" section below — duplicating them into "Selected Year"
  // would just repeat the same all-time data. Only "Top organisations" and
  // "By classification" actually differ by scope, backed by the two new
  // fields the backend now returns alongside the existing ones.
  const yearChartData = (currentStats?.total_by_rotary_year ?? []).map((row) => ({
    year: rotaryYearLabel(Number(row.label)),
    total: row.value,
  }));
  const topOrgsSelectedYear = (currentStats?.total_by_organisation_selected_year ?? [])
    .slice(0, 10)
    .map((row) => ({ name: row.label, total: row.value }));
  const topOrgsAllTime = (currentStats?.total_by_organisation ?? [])
    .slice(0, 10)
    .map((row) => ({ name: row.label, total: row.value }));
  // Story 11.6 — totals for the selected rotary year only, grouped by
  // classification ("Unclassified" included as its own bar).
  const classificationSelectedYear = (currentStats?.total_by_classification ?? []).map((row) => ({
    name: row.label,
    total: row.value,
  }));
  const classificationAllTime = (currentStats?.total_by_classification_all_time ?? []).map(
    (row) => ({ name: row.label, total: row.value }),
  );

  const emptyChartMessage = "No donations recorded yet.";

  // Story 16.14: hours have no currency, so they're the same single number
  // regardless of which currency block is selected above.
  const hoursChartData = (stats.service_hours_by_rotary_year ?? []).map((row) => ({
    year: rotaryYearLabel(Number(row.label)),
    total: row.value,
  }));

  const allTimeCards = [
    { value: formatCurrency(stats.all_time.total_hkd, "HKD"), label: "Total donated (all-time)" },
    { value: formatCurrency(stats.all_time.total_usd, "USD"), label: "Total donated (all-time)" },
    // Story 16.35 follow-up: counts an org supported by either an actual
    // OR a planned donation (was actual-only) — the page's own PPTX/PDF
    // export keeps a stricter actual-only "Reach" figure by design, but
    // this page's card is meant to reflect who the club is engaged with,
    // planned included.
    {
      value: stats.all_time_organisations_count_with_planned ?? stats.all_time_organisations_count,
      label: "Organisations supported (all-time)",
    },
    {
      value: `${stats.total_service_hours_all_time.toLocaleString()} h`,
      label: "Volunteer service hours (all-time)",
    },
  ];

  const selectedYearCards = [
    // Green = confirmed / delivered money.
    {
      value: formatCurrency(stats.selected_year.total_hkd, "HKD"),
      label: "Total donated (HKD)",
      variant: "stat-green",
    },
    // Rose = forecast / not yet received.
    {
      value: formatCurrency(stats.selected_year_planned?.total_hkd ?? 0, "HKD"),
      label: "Planned donations (HKD)",
      variant: "stat-rose",
    },
    // Lavender = donated + planned combined — replaces the old USD card.
    {
      value: formatCurrency(
        (stats.selected_year.total_hkd ?? 0) + (stats.selected_year_planned?.total_hkd ?? 0),
        "HKD",
      ),
      label: "Total (donated + planned)",
      variant: "stat-lavender",
    },
    {
      value:
        stats.selected_year_organisations_count_with_planned ?? stats.selected_year_organisations_count,
      label: "Organisations supported",
    },
    {
      value: `${stats.total_service_hours_selected_year.toLocaleString()} h`,
      label: "Volunteer service hours",
    },
  ];

  // Story 16.35 — planned totals by rotary year (current + future only),
  // for the currently selected currency block.
  const plannedByYearData = (currentStats?.planned_by_rotary_year ?? []).map((row) => ({
    year: rotaryYearLabel(Number(row.label)),
    total: row.value,
  }));

  // Story 8.30: the 4 chart types are reused for both the "Selected Year"
  // and "All Years" sections — factored out so each section is a short list
  // of {title, data, height, render} entries instead of duplicated JSX.
  function renderTrendCharts() {
    return (
      <>
        <div className="chart-card">
          <h2>Total donated per rotary year</h2>
          {yearChartData.length === 0 ? (
            <p className="member-empty-state">{emptyChartMessage}</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={yearChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value, currentStats.currency)} />
                <Bar dataKey="total" fill="var(--rotary-blue)" name="Total donated" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="chart-card">
          <h2>Year-over-year trend</h2>
          {yearChartData.length === 0 ? (
            <p className="member-empty-state">{emptyChartMessage}</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={yearChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value, currentStats.currency)} />
                <Line type="monotone" dataKey="total" stroke="var(--rotary-gold)" name="Total donated" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </>
    );
  }

  function renderHoursChart() {
    return (
      <div className="chart-card">
        <h2>Volunteer service hours per rotary year</h2>
        {hoursChartData.length === 0 ? (
          <p className="member-empty-state">No service hours recorded yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={hoursChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis />
              <Tooltip formatter={(value) => `${value} h`} />
              <Bar dataKey="total" fill="#5f55ee" name="Service hours" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    );
  }

  function renderPlannedChart() {
    return (
      <div className="chart-card">
        <h2>Planned donations — current &amp; future years</h2>
        {plannedByYearData.length === 0 ? (
          <p className="member-empty-state">No planned donations recorded yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={plannedByYearData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(value, currentStats.currency)} />
              <Bar dataKey="total" fill="#6b46c1" name="Planned donations" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    );
  }

  function renderTopOrgsChart(data) {
    return (
      <div className="chart-card">
        <h2>Top organisations by total donation</h2>
        {data.length === 0 ? (
          <p className="member-empty-state">{emptyChartMessage}</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(240, data.length * 28)}>
            <BarChart data={data} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => formatCurrency(value, currentStats.currency)} />
              <Bar dataKey="total" fill="#0f9d9f" name="Total donated" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    );
  }

  function renderClassificationChart(data, { title, emptyFallback }) {
    return (
      <div className="chart-card">
        <h2>{title}</h2>
        {data.length === 0 ? (
          <p className="member-empty-state">{emptyFallback}</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(240, data.length * 28)}>
            <BarChart data={data} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => formatCurrency(value, currentStats.currency)} />
              <Bar dataKey="total" fill="var(--rotary-gold)" name="Total donated" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    );
  }

  const allTimeUnconvertedWarning = stats.all_time.unconverted_count > 0 && (
    <p role="alert" className="text-[13px] text-[var(--low)]">
      {stats.all_time.unconverted_count} donation
      {stats.all_time.unconverted_count === 1 ? "" : "s"} in{" "}
      {stats.all_time.unconverted_currencies.join(", ")} excluded from the converted
      totals — add a rate in the Currencies tab.
    </p>
  );

  const selectedYearUnconvertedWarning = stats.selected_year.unconverted_count > 0 && (
    <p role="alert" className="text-[13px] text-[var(--low)]">
      {stats.selected_year.unconverted_count} donation
      {stats.selected_year.unconverted_count === 1 ? "" : "s"} in{" "}
      {stats.selected_year.unconverted_currencies.join(", ")} excluded — add a rate in the
      Currencies tab.
    </p>
  );

  return (
    <div className="admin-page admin-page-wide">
      <h1>Donation statistics</h1>
      <p className="mt-1 mb-5 text-sm text-[var(--color-muted-text)]">
        Giving and volunteer hours across supported NGOs.
      </p>

      <div className="mb-5 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="pl-0.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]">
              Format
            </span>
            <SingleSelectDropdown
              ariaLabel="Format"
              minWidthClass="min-w-[210px]"
              disabled={isGeneratingReport}
              value={reportFormat}
              options={[
                { value: "pdf", label: "Project Services (PDF)" },
                { value: "pptx", label: "PowerPoint (PPTX)" },
              ]}
              onSelect={handleReportFormatChange}
            />
          </div>

          {/* District template — only available for PPTX */}
          {reportFormat === "pptx" && (
            <label
              htmlFor="report-use-template"
              className="flex h-[38px] items-center gap-2 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]"
            >
              <input
                id="report-use-template"
                type="checkbox"
                checked={useTemplate}
                onChange={(event) => handleUseTemplateChange(event.target.checked)}
                disabled={isGeneratingReport}
              />
              District template
            </label>
          )}

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

      {stats.by_currency.length > 1 && (
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="pl-0.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]">
              Currency
            </span>
            <SingleSelectDropdown
              ariaLabel="Currency"
              minWidthClass="min-w-[150px]"
              value={selectedCurrency}
              options={stats.by_currency.map((block) => ({
                value: block.currency,
                label: currencyLabel(block.currency),
              }))}
              onSelect={setSelectedCurrency}
            />
          </div>
          <p className="text-[13px] text-[var(--muted)] pb-2">
            Totals are shown per currency — amounts in different currencies are never summed
            together.
          </p>
        </div>
      )}

      <>
        <h2 className="seclabel">All-time</h2>
          <div className="ngo-stats-grid stat-duo-grid mb-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {allTimeCards.map((card, index) => (
              <Card key={card.label + index} variant={STAT_VARIANTS[index % STAT_VARIANTS.length]} className="flex flex-col">
                <span className="text-3xl font-bold">{card.value}</span>
                <span className="mt-2 text-sm">{card.label}</span>
              </Card>
            ))}
          </div>

          {allTimeUnconvertedWarning}

          <div className="mb-2 mt-4 flex flex-col gap-1.5">
            <span className="pl-0.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]">
              Rotary year
            </span>
            <SingleSelectDropdown
              icon={Calendar}
              ariaLabel="View a rotary year"
              minWidthClass="min-w-[150px]"
              value={String(selectedYear ?? "")}
              options={yearOptions.map((year) => ({
                value: String(year),
                label: `${rotaryYearLabel(year)}${year === currentYear ? " (current)" : ""}`,
              }))}
              onSelect={(value) => setSelectedYear(Number(value))}
            />
          </div>

          <h2 className="seclabel">Selected Year — {rotaryYearLabel(stats.selected_rotary_year)}</h2>
          {/* 5 cards, one row on desktop (was a 4-col grid before the
              Planned Donations card was added) — a card can request its
              own fixed tone (e.g. Planned's stat-rose) instead of the
              row's blue/gold position-based alternation. */}
          <div className="ngo-stats-grid stat-duo-grid mb-4 grid grid-cols-2 sm:grid-cols-5 gap-4">
            {selectedYearCards.map((card, index) => (
              <Card
                key={card.label + index}
                variant={card.variant ?? STAT_VARIANTS[(index + 1) % STAT_VARIANTS.length]}
                className="flex flex-col"
              >
                <span className="text-3xl font-bold">{card.value}</span>
                <span className="mt-2 text-sm">{card.label}</span>
              </Card>
            ))}
          </div>

          {selectedYearUnconvertedWarning}
      </>

      <div className="chart-grid chart-grid-2col">
        {renderTopOrgsChart(topOrgsSelectedYear)}
        {renderClassificationChart(classificationSelectedYear, {
          title: `By classification — ${rotaryYearLabel(stats.selected_rotary_year)}`,
          emptyFallback: "No donations recorded for this year yet.",
        })}
        {renderPlannedChart()}
      </div>

      <h2 className="seclabel">All Years</h2>
      <div className="chart-grid chart-grid-2col">
        {renderTrendCharts()}
        {renderTopOrgsChart(topOrgsAllTime)}
        {renderClassificationChart(classificationAllTime, {
          title: "By classification — All years",
          emptyFallback: "No donations recorded yet.",
        })}
        {renderHoursChart()}
      </div>
    </div>
  );
}
