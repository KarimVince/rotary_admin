import { useEffect, useState } from "react";
import { fetchFinanceSummary } from "../api/finance";
import Card from "../components/Card";
import { FinanceBlock, FinanceRow } from "../components/FinanceBlock";
import RotaryYearField from "../components/RotaryYearField";
import { useAccess } from "../hooks/useAccess";
import { useRotaryYears } from "../hooks/useRotaryYears";
import { useTheme } from "../context/ThemeContext";
import { useWindowFocusRefetch } from "../hooks/useWindowFocusRefetch";
import { SELECT_CLASS } from "../styles/formControls";
import { rotaryYearLabel } from "../utils/rotaryYear";

function formatCurrency(value) {
  return `${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} HKD`;
}

function StatCard({ value, label, tone }) {
  return (
    <Card variant={tone} className="flex min-h-[104px] flex-col justify-center">
      <div className="text-xs font-semibold text-[var(--color-muted-text)]">{label}</div>
      <div className="mt-1 text-[22px] font-bold">{value}</div>
    </Card>
  );
}


// Story 17.1 — Finance module landing page. Two-column overview built
// entirely from 17.2-17.5's own live data via GET /finance/summary — no
// data entry here (see AppLayout.jsx for why this is a standalone nav
// entry, not a tab).
export default function FinanceSummary() {
  const { isMinimal } = useTheme();
  const { canRead } = useAccess("finance.summary");
  const { yearOptions, currentYear, selectedYear: year, setSelectedYear: setYear } = useRotaryYears({ persistKey: "finance" });
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    fetchFinanceSummary({ rotary_year: year })
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.detail || "Failed to load finance summary");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year, canRead]);

  // Every figure here is computed from other modules (Donations, Fund
  // Raising, Member Fees, Operational Tracking) — refetch quietly when the
  // user comes back to this tab so an edit made elsewhere shows up
  // without a full page reload.
  useWindowFocusRefetch(() => {
    if (!canRead) return;
    fetchFinanceSummary({ rotary_year: year })
      .then(setSummary)
      .catch(() => {
        // Silent background refresh — keep showing the last good data.
      });
  }, canRead);

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>Finance Summary</h1>
        <p role="alert">You do not have permission to view the Finance Summary.</p>
      </div>
    );
  }

  return (
    <div className="admin-page admin-page-wide">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h1 className="mb-1">Finance Summary</h1>
          <p className="text-sm text-[var(--color-muted-text)]">
            Charity results and club operational results, side by side, for{" "}
            {rotaryYearLabel(year)}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="no-print rounded-lg px-4 py-2 text-[13.5px] font-semibold text-[var(--color-brand-blue)] bg-white border border-[var(--color-brand-blue)] cursor-pointer shrink-0"
        >
          Print
        </button>
      </div>

      {isMinimal ? (
        <div className="no-print">
          <RotaryYearField
            year={year}
            yearOptions={yearOptions}
            currentYear={currentYear}
            onChange={setYear}
          />
        </div>
      ) : (
        <div className="flex items-center gap-3 mb-4 mt-4 no-print">
          <label htmlFor="finance-summary-year" className="text-sm font-semibold">
            Rotary Year
          </label>
          <select
            id="finance-summary-year"
            className={SELECT_CLASS}
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {rotaryYearLabel(y)}
              </option>
            ))}
          </select>
        </div>
      )}

      {isLoading && <p>Loading…</p>}
      {loadError && (
        <p role="alert" className="text-[var(--color-danger)]">
          {loadError}
        </p>
      )}

      {!isLoading && !loadError && summary && isMinimal && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <FinanceBlock title="Charity & Donation Results">
              <FinanceRow label="Total Fundraising" value={formatCurrency(summary.total_fundraising)} />
              <FinanceRow label="Total Donations" value={formatCurrency(summary.total_donations)} />
              <FinanceRow
                label="Remaining for Donation"
                value={formatCurrency(summary.remaining_for_donation)}
                isTotal
              />
            </FinanceBlock>
            <FinanceBlock title="Club Operational Results">
              <FinanceRow label="Fees Collected" value={formatCurrency(summary.fees_collected)} />
              <FinanceRow label="Total Revenue" value={formatCurrency(summary.total_revenue)} />
              <FinanceRow label="Total Expenses" value={formatCurrency(summary.total_expenses)} />
              <FinanceRow label="Net Balance" value={formatCurrency(summary.net_balance)} isTotal />
            </FinanceBlock>
          </div>
          <p className="text-xs text-[var(--color-muted-text)] mt-3">
            Fundraising and donations are separate flows, never added together.
          </p>
        </>
      )}

      {!isLoading && !loadError && summary && !isMinimal && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section>
            <h2 className="text-[17px] font-bold text-[var(--color-brand-blue)] mb-3">
              Charity &amp; Donation Results
            </h2>
            <p className="text-xs text-[var(--color-muted-text)] mb-3 -mt-2">
              Fundraising (money raised) and Donations (money given out) are separate, unrelated
              flows — never added together.
            </p>
            <div className="flex flex-col gap-4">
              <StatCard
                value={formatCurrency(summary.remaining_for_donation)}
                label="Remaining Amount for Donation"
                tone="stat-lavender"
              />
              <div className="grid grid-cols-2 gap-4">
                <StatCard
                  value={formatCurrency(summary.total_fundraising)}
                  label="Total Fundraising"
                  tone="stat-teal"
                />
                <StatCard
                  value={formatCurrency(summary.total_donations)}
                  label="Total Donations"
                  tone="stat-blue"
                />
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-[17px] font-bold text-[var(--color-brand-blue)] mb-3">
              Club Operational Results
            </h2>
            <div className="flex flex-col gap-4">
              <StatCard
                value={formatCurrency(summary.net_balance)}
                label="Net Balance"
                tone="stat-amber"
              />
              <div className="grid grid-cols-3 gap-4">
                <StatCard
                  value={formatCurrency(summary.fees_collected)}
                  label="Fees Collected"
                  tone="stat-blue"
                />
                <StatCard
                  value={formatCurrency(summary.total_revenue)}
                  label="Total Revenue"
                  tone="stat-teal"
                />
                <StatCard
                  value={formatCurrency(summary.total_expenses)}
                  label="Total Expenses"
                  tone="stat-rose"
                />
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
