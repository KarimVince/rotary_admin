import { useEffect, useState } from "react";
import { fetchFinanceSummary } from "../api/finance";
import { FinanceBlock, FinanceRow } from "../components/FinanceBlock";
import RotaryYearField from "../components/RotaryYearField";
import { useAccess } from "../hooks/useAccess";
import { useRotaryYears } from "../hooks/useRotaryYears";
import { useWindowFocusRefetch } from "../hooks/useWindowFocusRefetch";
import { rotaryYearLabel } from "../utils/rotaryYear";

function formatCurrency(value) {
  return `${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} HKD`;
}

// Story 17.1 — Finance module landing page. Two-column overview built
// entirely from 17.2-17.5's own live data via GET /finance/summary — no
// data entry here (see AppLayout.jsx for why this is a standalone nav
// entry, not a tab).
export default function FinanceSummary() {
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

      <div className="no-print">
        <RotaryYearField
          year={year}
          yearOptions={yearOptions}
          currentYear={currentYear}
          onChange={setYear}
        />
      </div>

      {isLoading && <p>Loading…</p>}
      {loadError && (
        <p role="alert" className="text-[var(--color-danger)]">
          {loadError}
        </p>
      )}

      {!isLoading && !loadError && summary && (
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
    </div>
  );
}
