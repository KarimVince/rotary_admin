import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchMemberFeeStatistics } from "../api/memberFees";
import { currentRotaryYear, rotaryYearLabel } from "../utils/rotaryYear";
import { useAccess } from "../hooks/useAccess";
import { useFeeYearOptions } from "../hooks/useFeeYearOptions";

function formatCurrency(value, currency) {
  const formatted = Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return currency ? `${formatted} ${currency}` : formatted;
}

export default function FeeStatistics() {
  const { canRead } = useAccess("fees.statistics");
  const { yearOptions } = useFeeYearOptions();

  const [year, setYear] = useState(currentRotaryYear());
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [reportFormat, setReportFormat] = useState("pdf");
  const [reportError, setReportError] = useState(null);

  // Placeholder — report generation isn't implemented yet for this page.
  function handleGenerateReport() {
    setReportError("Report generation is coming soon.");
  }

  async function loadStats() {
    setIsLoading(true);
    setLoadError(null);
    try {
      setStats(await fetchMemberFeeStatistics({ rotary_year: year }));
    } catch (err) {
      setLoadError(err.detail || "Failed to load fee statistics");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, canRead]);

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>Fee statistics</h1>
        <p role="alert">You do not have permission to view fee statistics.</p>
      </div>
    );
  }

  const chartData = stats?.breakdown_by_price_type.map((row) => ({
    tier: row.price_type,
    total: row.total_amount,
    count: row.count,
  }));

  return (
    <div className="admin-page">
      <h1>Fee statistics</h1>

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

      <label htmlFor="fee-stats-year" className="fee-year-label">
        Rotary year
      </label>
      <select
        id="fee-stats-year"
        className="fee-year-select"
        value={year}
        onChange={(event) => setYear(Number(event.target.value))}
      >
        {yearOptions.map((y) => (
          <option key={y} value={y}>
            {rotaryYearLabel(y)}
          </option>
        ))}
      </select>

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && stats && (
        <>
          <div className="stat-cards-row-3">
            <div className="stat-card">
              <span className="stat-value">
                {formatCurrency(stats.total_collected, stats.currency)}
              </span>
              <span className="stat-label">Total collected — {rotaryYearLabel(year)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">
                {formatCurrency(stats.total_outstanding, stats.currency)}
              </span>
              <span className="stat-label">Total outstanding — {rotaryYearLabel(year)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.collection_rate.toFixed(1)}%</span>
              <span className="stat-label">Collection rate — {rotaryYearLabel(year)}</span>
            </div>
          </div>

          <p>
            {stats.paid_count} paid, {stats.unpaid_count} unpaid, {stats.total_members} total
            member{stats.total_members === 1 ? "" : "s"} billed.
          </p>

          <section className="chart-section">
            <h2>Amount by price tier</h2>
            {!chartData || chartData.length === 0 ? (
              <p className="member-empty-state">No fee records for {rotaryYearLabel(year)} yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="tier" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatCurrency(value, stats.currency)} />
                  <Bar dataKey="total" fill="#17458f" name="Total amount" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </section>
        </>
      )}
    </div>
  );
}
