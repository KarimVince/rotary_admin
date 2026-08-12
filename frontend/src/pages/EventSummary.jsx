import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { downloadEventSummaryReport, getEventSummary } from "../api/eventSummary";
import { useAccess } from "../hooks/useAccess";
import { formatCurrency } from "../utils/formatters";
import Card from "../components/Card";

const PIE_COLORS = ["var(--rotary-blue)", "var(--rotary-gold)", "#5f55ee", "#0f9d9f", "#b3261e", "#9aa4b2"];

// Stat cards match Dashboard's format (value-first <span>, label <span>,
// inside a `.stat-duo-grid` parent for the blue/gold alternation + compact
// type-scale).
function StatCard({ label, value }) {
  return (
    <Card variant="stat-blue" className="flex flex-col">
      <span className="text-3xl font-bold">{formatCurrency(value)}</span>
      <span className="mt-2 text-sm">{label}</span>
    </Card>
  );
}

function StatTile({ value, label }) {
  return (
    <Card variant="stat-blue" className="flex flex-col">
      <span className="text-3xl font-bold">{formatCurrency(value)}</span>
      <span className="mt-2 text-sm">{label}</span>
    </Card>
  );
}

export default function EventSummary({ event: selectedEvent }) {
  const { canRead } = useAccess("event.summary");

  const [summary, setSummary] = useState(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);

  const [reportFormat, setReportFormat] = useState("pdf");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState(null);

  useEffect(() => {
    if (!selectedEvent) return;
    setIsLoadingSummary(true);
    getEventSummary(selectedEvent.id).then((data) => {
      setSummary(data);
      setIsLoadingSummary(false);
    });
  }, [selectedEvent]);

  async function handleGenerateReport() {
    setIsGeneratingReport(true);
    setReportError(null);
    try {
      const { blob, filename } = await downloadEventSummaryReport(selectedEvent.id, reportFormat);
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

  if (!canRead) {
    return (
      <div className="admin-page event-summary-page">
        <h1>Event Summary</h1>
        <p role="alert">You do not have permission to view the Event Summary.</p>
      </div>
    );
  }

  const maxCostCategory = summary
    ? Math.max(...summary.cost_breakdown.map((entry) => entry.value), 1)
    : 1;

  return (
    <div className="admin-page admin-page-wide event-summary-page">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="m-0 text-2xl font-semibold text-[var(--text-h)]">Summary</h1>
        {selectedEvent && (
          <div className="flex items-center gap-3">
            <label htmlFor="summary-report-format" className="sr-only">
              Format
            </label>
            <select
              id="summary-report-format"
              value={reportFormat}
              onChange={(e) => setReportFormat(e.target.value)}
              disabled={isGeneratingReport}
              className="rounded-[10px] border border-[var(--color-border-medium)] px-3 py-2 text-[13px]"
            >
              <option value="pdf">PDF</option>
              <option value="pptx">PPT</option>
            </select>
            <button
              type="button"
              onClick={handleGenerateReport}
              disabled={isGeneratingReport}
              className="rounded-[10px] bg-[var(--color-brand-blue-light)] px-4 py-[9px] text-[13px] font-semibold text-[var(--color-brand-blue)]"
            >
              {isGeneratingReport ? "Generating…" : "Generate Report"}
            </button>
          </div>
        )}
      </div>

      {selectedEvent && isLoadingSummary && <p>Loading summary…</p>}

      {selectedEvent && !isLoadingSummary && summary && (
        <>
          {reportError && <p role="alert">{reportError}</p>}

          {/* Story fix: charity fundraising (lucky draw/auction/donations)
              and the club's own operational result (ticket + sponsor
              revenue minus organisational cost) are two separate pots of
              money — never netted together into one blended
              income/cost/proceeds figure. */}
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 stat-duo-grid">
            <StatTile value={summary.total_raised} label="Fundraising total" />
            <StatTile value={summary.net_operational_result} label="Operational result" />
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card variant="default" className="p-[22px]">
              <span className="text-[13px] font-bold text-[var(--text-h)]">Income breakdown</span>
              <div className="mt-[14px] flex items-center gap-5">
                <ResponsiveContainer width={110} height={110}>
                  <PieChart>
                    <Pie
                      data={summary.revenue_breakdown}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={32}
                      outerRadius={55}
                    >
                      {summary.revenue_breakdown.map((entry, index) => (
                        <Cell key={entry.label} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2 text-[12px] text-[var(--text)]">
                  {summary.revenue_breakdown.map((entry, index) => (
                    <span key={entry.label} className="flex items-center gap-2">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: PIE_COLORS[index % PIE_COLORS.length] }}
                      />
                      {entry.label} — {formatCurrency(entry.value)}
                    </span>
                  ))}
                </div>
              </div>
            </Card>

            <Card variant="default" className="p-[22px]">
              <span className="text-[13px] font-bold text-[var(--text-h)]">Cost breakdown</span>
              <div className="mt-[14px] flex flex-col gap-[10px]">
                {summary.cost_breakdown.map((entry, index) => (
                  <div key={entry.label}>
                    <div className="mb-1 flex justify-between text-[12px] text-[var(--text)]">
                      <span>{entry.label}</span>
                      <span>{formatCurrency(entry.value)}</span>
                    </div>
                    <div className="h-2 rounded bg-[#f0f2f6]">
                      <div
                        className="h-full rounded"
                        style={{
                          width: `${(entry.value / maxCostCategory) * 100}%`,
                          background: PIE_COLORS[index % PIE_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <h2 className="mb-3 mt-6 text-[15px] font-bold uppercase tracking-[0.04em] text-[var(--text-h)]">
            Fundraising Results
          </h2>
          <div className="event-summary-cards mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 stat-duo-grid">
            <StatCard label="Total Raised" value={summary.total_raised} />
            <StatCard label="Auction Total" value={summary.auction_total} />
            <StatCard label="Lucky Draw Total" value={summary.lucky_draw_total} />
            <StatCard label="Other Donation" value={summary.other_donation} />
          </div>

          <h2 className="mb-3 text-[15px] font-bold uppercase tracking-[0.04em] text-[var(--text-h)]">Revenue</h2>
          <div className="event-summary-cards mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 stat-duo-grid">
            <StatCard label="Total Revenue" value={summary.total_revenue} />
            <StatCard label="Ticket Revenue" value={summary.ticket_revenue} />
            <StatCard label="Sponsor Revenue" value={summary.sponsor_revenue} />
          </div>

          <h2 className="mb-3 text-[15px] font-bold uppercase tracking-[0.04em] text-[var(--text-h)]">
            Operational Cost
          </h2>
          <div className="event-summary-cards mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 stat-duo-grid">
            <StatCard label="Total Cost" value={summary.total_cost} />
            {summary.cost_per_category.map((entry) => (
              <StatCard key={entry.label} label={entry.label} value={entry.value} />
            ))}
          </div>

          <h2 className="mb-3 text-[15px] font-bold uppercase tracking-[0.04em] text-[var(--text-h)]">
            Operational Result
          </h2>
          <div className="event-summary-cards mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 stat-duo-grid">
            <StatCard label="Net Operational Result" value={summary.net_operational_result} />
          </div>

          <Card variant="default" className="p-[22px]">
            <span className="text-[13px] font-bold text-[var(--text-h)]">Result overview</span>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={summary.result_overview}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Bar dataKey="value" name="HKD" fill="var(--rotary-blue)" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}
    </div>
  );
}
