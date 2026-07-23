import { useEffect, useMemo, useState } from "react";
import { fetchDonationStatistics, listDonations } from "../api/donations";
import { listOrganisations } from "../api/organisations";
import Card from "../components/Card";
import { useAccess } from "../hooks/useAccess";
import { useRotaryYears } from "../hooks/useRotaryYears";
import { SELECT_CLASS } from "../styles/formControls";
import { formatDate } from "../utils/formatters";
import { rotaryYearLabel } from "../utils/rotaryYear";

function formatCurrency(value, currency) {
  return `${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} ${currency}`;
}

function StatCard({ value, label }) {
  return (
    <Card variant="stat-blue" className="flex min-h-[104px] flex-col justify-center">
      <div className="text-xs font-semibold text-[var(--color-muted-text)]">{label}</div>
      <div className="mt-1 text-[22px] font-bold">{value}</div>
    </Card>
  );
}

// Story 17.2 — Finance module, Donation Results page. A pure read-only
// recap of existing NGO/Donation data (no new data entry) reached via its
// own nav entry under the Finance section (Story 17.2 follow-up: reverted
// from a tabbed single Finance page to a proper menu/submenu structure —
// each Finance page is its own nav entry + matrix key, not a query-param
// tab, matching Members/NGOs/Friends rather than the Member Fees tab style).
export default function FinanceDonations() {
  const { canRead } = useAccess("finance.donations");
  const { yearOptions, selectedYear: year, setSelectedYear: setYear } = useRotaryYears();
  const [organisations, setOrganisations] = useState([]);
  const [donations, setDonations] = useState([]);
  const [stats, setStats] = useState(null);
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
    Promise.all([
      listOrganisations({ rotary_year: year }),
      listDonations({ rotary_year: year }),
      fetchDonationStatistics({ rotary_year: year }),
    ])
      .then(([orgsData, donationsData, statsData]) => {
        if (cancelled) return;
        setOrganisations(orgsData);
        setDonations(donationsData);
        setStats(statsData);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.detail || "Failed to load donation results");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year, canRead]);

  const donationsByOrg = useMemo(() => {
    const grouped = new Map();
    organisations.forEach((org) => grouped.set(org.id, { organisation: org, entries: [] }));
    donations.forEach((donation) => {
      const group = grouped.get(donation.organisation_id);
      if (!group) return;
      group.entries.push(donation);
    });
    return Array.from(grouped.values()).sort((a, b) =>
      a.organisation.name.localeCompare(b.organisation.name),
    );
  }, [organisations, donations]);

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>Donation Results</h1>
        <p role="alert">You do not have permission to view Donation Results.</p>
      </div>
    );
  }

  return (
    <div className="admin-page admin-page-wide">
      <div className="mb-1">
        <h1 className="mb-1">Donation Results</h1>
        <p className="text-sm text-[var(--color-muted-text)]">
          Read-only recap of NGO donations for the selected rotary year.
        </p>
      </div>

      <div className="flex items-center gap-3 mb-4 mt-4">
        <label htmlFor="donation-results-year" className="text-sm font-semibold">
          Rotary Year
        </label>
        <select
          id="donation-results-year"
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

      {isLoading && <p>Loading…</p>}
      {loadError && (
        <p role="alert" className="text-[var(--color-danger)]">
          {loadError}
        </p>
      )}

      {!isLoading && !loadError && (
        <>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <StatCard value={organisations.length} label="Organisations supported" />
            <StatCard
              value={formatCurrency(stats?.selected_year?.total_hkd, "HKD")}
              label="Total donated (HKD equiv.)"
            />
          </div>

          {donationsByOrg.length === 0 && (
            <p className="text-sm text-[var(--color-muted-text)]">
              No donations recorded for this rotary year.
            </p>
          )}

          {donationsByOrg.map(({ organisation, entries }) => (
            <Card key={organisation.id} variant="default" className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold">{organisation.name}</h3>
                <span className="text-sm font-semibold">
                  {formatCurrency(organisation.year_total, "HKD")}
                </span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--color-muted-text)]">
                    <th className="pb-1 font-medium">Date</th>
                    <th className="pb-1 font-medium">Amount</th>
                    <th className="pb-1 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {[...entries]
                    .sort((a, b) => (a.donation_date < b.donation_date ? 1 : -1))
                    .map((entry) => (
                      <tr key={entry.id}>
                        <td className="py-1">{formatDate(entry.donation_date)}</td>
                        <td className="py-1">{formatCurrency(entry.amount, entry.currency)}</td>
                        <td className="py-1">{entry.notes || "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
