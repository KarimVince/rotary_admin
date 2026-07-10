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

  // Placeholder — report generation isn't implemented yet for NGO statistics.
  function handleGenerateReport() {
    setReportError("Report generation is coming soon.");
  }

  useEffect(() => {
    if (!canRead) return;
    fetchDonationStatistics(selectedYear !== null ? { rotary_year: selectedYear } : {})
      .then((data) => {
        setStats(data);
        setSelectedCurrency((current) => current ?? data.by_currency[0]?.currency ?? null);
        setSelectedYear(data.selected_rotary_year);
      })
      .catch((err) => setError(err.detail || "Failed to load donation statistics"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead, selectedYear]);

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>Donation statistics</h1>
        <p role="alert">You do not have permission to view Donation statistics.</p>
      </div>
    );
  }

  const currentStats = useMemo(
    () => stats?.by_currency.find((block) => block.currency === selectedCurrency) ?? null,
    [stats, selectedCurrency],
  );

  const yearOptions = useMemo(() => {
    if (!currentStats) return [];
    const years = new Set(currentStats.total_by_rotary_year.map((row) => Number(row.label)));
    years.add(currentRotaryYear());
    return [...years].sort((a, b) => b - a);
  }, [currentStats]);

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

  if (stats.by_currency.length === 0 || !currentStats) {
    return (
      <div className="admin-page">
        <h1>Donation statistics</h1>
        <p className="member-empty-state">No donations recorded yet.</p>
      </div>
    );
  }

  const yearChartData = currentStats.total_by_rotary_year.map((row) => ({
    year: rotaryYearLabel(Number(row.label)),
    total: row.value,
  }));
  const topOrgs = currentStats.total_by_organisation.slice(0, 10).map((row) => ({
    name: row.label,
    total: row.value,
  }));

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

  return (
    <div className="admin-page">
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

      <div className="chart-grid">
        <div className="chart-card">
          <h2>Total donated per rotary year</h2>
          {yearChartData.length === 0 ? (
            <p className="member-empty-state">No donations recorded yet.</p>
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
            <p className="member-empty-state">No donations recorded yet.</p>
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

        <div className="chart-card">
          <h2>Top organisations by total donation</h2>
          {topOrgs.length === 0 ? (
            <p className="member-empty-state">No donations recorded yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(240, topOrgs.length * 28)}>
              <BarChart data={topOrgs} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => formatCurrency(value, currentStats.currency)} />
                <Bar dataKey="total" fill="#0f9d9f" name="Total donated" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
