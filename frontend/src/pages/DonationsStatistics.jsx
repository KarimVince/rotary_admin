import { useEffect, useMemo, useState } from "react";
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
import { fetchDonationStatistics } from "../api/donations";
import { listNgoClassifications } from "../api/ngoClassifications";
import { useAccess } from "../hooks/useAccess";
import { currentRotaryYear, rotaryYearLabel } from "../utils/rotaryYear";
import { currencyLabel } from "../data/currencies";

function formatCurrency(value, currency) {
  return `${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} ${currency}`;
}

const STAT_TONES = ["blue", "lavender", "teal", "amber"];

export default function DonationsStatistics() {
  const { canRead } = useAccess("ngos.statistics");
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [selectedCurrency, setSelectedCurrency] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [reportFormat, setReportFormat] = useState("pdf");
  const [reportError, setReportError] = useState(null);
  const [classifications, setClassifications] = useState([]);
  const [classificationFilter, setClassificationFilter] = useState("");

  // Placeholder — report generation isn't implemented yet for NGO statistics.
  function handleGenerateReport() {
    setReportError("Report generation is coming soon.");
  }

  useEffect(() => {
    // Non-fatal — the filter just doesn't render if this fails.
    listNgoClassifications()
      .then(setClassifications)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!canRead) return;
    const filters = {};
    if (selectedYear !== null) filters.rotary_year = selectedYear;
    if (classificationFilter) filters.classification_id = classificationFilter;
    fetchDonationStatistics(filters)
      .then((data) => {
        setStats(data);
        setSelectedCurrency((current) => current ?? data.by_currency[0]?.currency ?? null);
        setSelectedYear(data.selected_rotary_year);
      })
      .catch((err) => setError(err.detail || "Failed to load donation statistics"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead, selectedYear, classificationFilter]);

  const currentStats = useMemo(
    () => stats?.by_currency.find((block) => block.currency === selectedCurrency) ?? null,
    [stats, selectedCurrency],
  );

  const yearOptions = useMemo(() => {
    const years = new Set(
      (currentStats?.total_by_rotary_year ?? []).map((row) => Number(row.label)),
    );
    years.add(currentRotaryYear());
    if (stats) years.add(stats.selected_rotary_year);
    return [...years].sort((a, b) => b - a);
  }, [currentStats, stats]);

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

  const emptyChartMessage = classificationFilter
    ? "No NGOs found for this classification."
    : "No donations recorded yet.";

  const allTimeCards = [
    { value: formatCurrency(stats.all_time.total_hkd, "HKD"), label: "Total donated (all-time)" },
    { value: formatCurrency(stats.all_time.total_usd, "USD"), label: "Total donated (all-time)" },
    { value: stats.all_time_organisations_count, label: "Organisations supported (all-time)" },
  ];

  const selectedYearCards = [
    {
      value: formatCurrency(stats.selected_year.total_hkd, "HKD"),
      label: `Total donated — ${rotaryYearLabel(stats.selected_rotary_year)}`,
    },
    {
      value: formatCurrency(stats.selected_year.total_usd, "USD"),
      label: `Total donated — ${rotaryYearLabel(stats.selected_rotary_year)}`,
    },
    {
      value: stats.selected_year_organisations_count,
      label: `Organisations supported — ${rotaryYearLabel(stats.selected_rotary_year)}`,
    },
  ];

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
                <Bar dataKey="total" fill="#17458f" name="Total donated" />
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
                <Line type="monotone" dataKey="total" stroke="#f7a81b" name="Total donated" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </>
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
          <p className="member-empty-state">
            {classificationFilter ? emptyChartMessage : emptyFallback}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(240, data.length * 28)}>
            <BarChart data={data} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => formatCurrency(value, currentStats.currency)} />
              <Bar dataKey="total" fill="#f7a81b" name="Total donated" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    );
  }

  return (
    <div className="admin-page admin-page-wide">
      <h1>Donation statistics</h1>

      <div className="report-controls">
        <label htmlFor="report-format">Generate report</label>
        <select
          id="report-format"
          value={reportFormat}
          onChange={(event) => setReportFormat(event.target.value)}
        >
          <option value="pdf">PDF</option>
          <option value="pptx">PowerPoint (PPTX)</option>
        </select>
        <button type="button" onClick={handleGenerateReport}>
          Generate Report
        </button>
        {reportError && <p role="alert">{reportError}</p>}
      </div>

      {classifications.length > 0 && (
        <section className="donation-classification-filter">
          <label htmlFor="stats-classification">Classification</label>
          <select
            id="stats-classification"
            value={classificationFilter}
            onChange={(event) => setClassificationFilter(event.target.value)}
          >
            <option value="">All classifications</option>
            {classifications.map((classification) => (
              <option key={classification.id} value={classification.id}>
                {classification.name}
              </option>
            ))}
          </select>
        </section>
      )}

      {stats.by_currency.length > 1 && (
        <section className="donation-currency-filter">
          <label htmlFor="stats-currency">Currency</label>
          <select
            id="stats-currency"
            value={selectedCurrency}
            onChange={(event) => setSelectedCurrency(event.target.value)}
          >
            {stats.by_currency.map((block) => (
              <option key={block.currency} value={block.currency}>
                {currencyLabel(block.currency)}
              </option>
            ))}
          </select>
          <p className="donation-currency-note">
            Totals are shown per currency — amounts in different currencies are never summed
            together.
          </p>
        </section>
      )}

      <div className="stat-cards-row-3 stat-cards-row-3-compact">
        {allTimeCards.map((card, index) => (
          <div key={card.label + index} className={`stat-card stat-card-${STAT_TONES[index % STAT_TONES.length]}`}>
            <span className="stat-value">{card.value}</span>
            <span className="stat-label">{card.label}</span>
          </div>
        ))}
      </div>

      {stats.all_time.unconverted_count > 0 && (
        <p role="alert" className="donation-unconverted-warning">
          {stats.all_time.unconverted_count} donation
          {stats.all_time.unconverted_count === 1 ? "" : "s"} in{" "}
          {stats.all_time.unconverted_currencies.join(", ")} excluded from the converted
          totals — add a rate in the Currencies tab.
        </p>
      )}

      <div className="stat-cards-row-3 stat-cards-row-3-compact">
        {selectedYearCards.map((card, index) => (
          <div
            key={card.label + index}
            className={`stat-card stat-card-${STAT_TONES[(index + 1) % STAT_TONES.length]}`}
          >
            <span className="stat-value">{card.value}</span>
            <span className="stat-label">{card.label}</span>
          </div>
        ))}
      </div>

      {stats.selected_year.unconverted_count > 0 && (
        <p role="alert" className="donation-unconverted-warning">
          {stats.selected_year.unconverted_count} donation
          {stats.selected_year.unconverted_count === 1 ? "" : "s"} in{" "}
          {stats.selected_year.unconverted_currencies.join(", ")} excluded — add a rate in the
          Currencies tab.
        </p>
      )}

      <section className="donation-year-filter">
        <label htmlFor="stats-year">View a rotary year</label>
        <select
          id="stats-year"
          value={selectedYear ?? ""}
          onChange={(event) => setSelectedYear(Number(event.target.value))}
        >
          {yearOptions.map((year) => (
            <option key={year} value={year}>
              {rotaryYearLabel(year)}
              {year === currentRotaryYear() ? " (current)" : ""}
            </option>
          ))}
        </select>
      </section>

      <h2>Selected Year — {rotaryYearLabel(stats.selected_rotary_year)}</h2>
      <div className="chart-grid chart-grid-2col">
        {renderTopOrgsChart(topOrgsSelectedYear)}
        {renderClassificationChart(classificationSelectedYear, {
          title: `By classification — ${rotaryYearLabel(stats.selected_rotary_year)}`,
          emptyFallback: "No donations recorded for this year yet.",
        })}
      </div>

      <h2>All Years</h2>
      <div className="chart-grid chart-grid-2col">
        {renderTrendCharts()}
        {renderTopOrgsChart(topOrgsAllTime)}
        {renderClassificationChart(classificationAllTime, {
          title: "By classification — All years",
          emptyFallback: "No donations recorded yet.",
        })}
      </div>
    </div>
  );
}
