import { useEffect, useMemo, useState } from "react";
import { fetchDonationStatistics, listDonations } from "../api/donations";
import { listOrganisations } from "../api/organisations";
import Card from "../components/Card";
import RotaryYearField from "../components/RotaryYearField";
import { useAccess } from "../hooks/useAccess";
import { useRotaryYears } from "../hooks/useRotaryYears";
import { formatDate } from "../utils/formatters";

function formatCurrency(value, currency) {
  return `${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} ${currency}`;
}

function StatCard({ value, label }) {
  return (
    <Card variant="stat-blue" className="flex flex-col">
      <span className="text-3xl font-bold">{value}</span>
      <span className="mt-2 text-sm">{label}</span>
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
  const { yearOptions, currentYear, selectedYear: year, setSelectedYear: setYear } = useRotaryYears({ persistKey: "finance" });
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

      <RotaryYearField
        year={year}
        yearOptions={yearOptions}
        currentYear={currentYear}
        onChange={setYear}
      />

      {isLoading && <p>Loading…</p>}
      {loadError && (
        <p role="alert" className="text-[var(--color-danger)]">
          {loadError}
        </p>
      )}

      {!isLoading && !loadError && (
        <>
          <div className="grid grid-cols-2 gap-4 mb-6 stat-duo-grid">
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
            <div key={organisation.id} className="fin-block mb-4">
              <div className="fin-blockhead">
                <span className="fin-mm">{organisation.name}</span>
                <span className="fin-rt">{formatCurrency(organisation.year_total, "HKD")}</span>
              </div>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-left px-4 py-2.5 !text-[12.5px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]">
                      Date
                    </th>
                    <th className="text-left px-4 py-2.5 !text-[12.5px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]">
                      Amount
                    </th>
                    <th className="text-left px-4 py-2.5 !text-[12.5px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]">
                      Notes
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...entries]
                    .sort((a, b) => (a.donation_date < b.donation_date ? 1 : -1))
                    .map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-4 py-2.5 !text-[14.5px]">{formatDate(entry.donation_date)}</td>
                        <td className="px-4 py-2.5 !text-[14.5px]">
                          {formatCurrency(entry.amount, entry.currency)}
                        </td>
                        <td className="px-4 py-2.5 !text-[14.5px]">{entry.notes || "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
