import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  fetchMemberFeeStatistics,
  fetchMemberFeeStatisticsHistory,
  generateMemberFeeStatisticsReport,
  listMemberFees,
  updateMemberFee,
} from "../api/memberFees";
import {
  createFeeRun,
  listMemberFees as listMemberFeesForYear,
  sendFeeInvoices,
} from "../api/feeRuns";
import {
  createFeeSettings,
  getFeeSettings,
  listFeeSettings,
  updateFeeSettings,
} from "../api/feeSettings";
import { listMembers } from "../api/members";
import Card from "../components/Card";
import { CURRENCIES, currencyLabel } from "../data/currencies";
import { useAccess } from "../hooks/useAccess";
import { useRotaryYears } from "../hooks/useRotaryYears";
import { SELECT_CLASS } from "../styles/formControls";
import { currentRotaryYear, rotaryYearLabel } from "../utils/rotaryYear";

const TABS = [
  { key: "tracking", label: "Tracking", permission: "fees.tracking" },
  { key: "run", label: "Fee Run", permission: "fees.run" },
  { key: "statistics", label: "Statistics", permission: "fees.statistics" },
  { key: "settings", label: "Settings", permission: "fees.settings" },
];

function StatCard({ value, valueClass, label, bg }) {
  return (
    <Card
      variant="default"
      className="!rounded-2xl flex min-h-[104px] flex-col justify-center !p-4"
      style={bg ? { background: bg } : undefined}
    >
      <div className="text-xs font-semibold text-[var(--color-muted-text)]">{label}</div>
      <div className={`mt-1 text-[22px] font-bold ${valueClass}`}>{value}</div>
    </Card>
  );
}

function TabBar({ tabs, activeTab, onSelect }) {
  return (
    <div className="flex gap-7 border-b border-[var(--color-card-border)] mb-6">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onSelect(tab.key)}
          className={`border-none bg-transparent pb-3 -mb-px text-[14.5px] font-semibold cursor-pointer border-b-2 ${
            tab.key === activeTab
              ? "border-[var(--color-brand-blue)] text-[var(--color-brand-blue)]"
              : "border-transparent text-[var(--color-muted-text)]"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

const PAID_FILTERS = [
  { value: "", label: "All" },
  { value: "false", label: "Unpaid" },
  { value: "true", label: "Paid" },
];

const CHANNEL_OPTIONS = [
  { value: "email", label: "Mail" },
  { value: "manual", label: "Manual" },
];

const TIER_OPTIONS = [
  { value: "early_bird", label: "Early Bird" },
  { value: "full", label: "Full" },
  { value: "sponsored", label: "Sponsored" },
];

function TrackingTab() {
  const { canRead, canWrite: canManage } = useAccess("fees.tracking");
  const { yearOptions, selectedYear: year, setSelectedYear: setYear } = useRotaryYears();
  const [paidFilter, setPaidFilter] = useState("");
  const [search, setSearch] = useState("");
  const [members, setMembers] = useState([]);
  const [fees, setFees] = useState([]);
  const [hasFeeSettingsForYear, setHasFeeSettingsForYear] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [rowErrors, setRowErrors] = useState({});

  const [isSendingReminder, setIsSendingReminder] = useState(false);
  const [reminderResult, setReminderResult] = useState(null);
  const [reminderError, setReminderError] = useState(null);

  async function loadData() {
    setIsLoading(true);
    setLoadError(null);
    try {
      const filters = { rotary_year: year };
      if (paidFilter !== "") filters.is_paid = paidFilter;
      const [membersData, feesData] = await Promise.all([
        listMembers({ active_in_rotary_year: year, is_honorary: false }),
        listMemberFees(filters),
      ]);
      setMembers(membersData);
      setFees(feesData);

      try {
        await getFeeSettings(year);
        setHasFeeSettingsForYear(true);
      } catch (err) {
        if (err.status === 404) {
          setHasFeeSettingsForYear(false);
        } else {
          throw err;
        }
      }
    } catch (err) {
      setLoadError(err.detail || "Failed to load fee tracking data");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, paidFilter, canRead]);

  const membersById = useMemo(() => {
    const map = new Map();
    members.forEach((member) => map.set(member.id, member));
    return map;
  }, [members]);

  function memberName(memberId) {
    const member = membersById.get(memberId);
    return member ? `${member.first_name} ${member.last_name}` : "Unknown member";
  }

  const visibleFees = useMemo(() => {
    if (!search.trim()) return fees;
    const q = search.trim().toLowerCase();
    return fees.filter((fee) => memberName(fee.member_id).toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fees, search, membersById]);

  const placeholderRows = useMemo(() => {
    if (!hasFeeSettingsForYear || paidFilter === "true") return [];
    const billedMemberIds = new Set(fees.map((fee) => fee.member_id));
    return members
      .filter((member) => !billedMemberIds.has(member.id))
      .filter((member) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return `${member.first_name} ${member.last_name}`.toLowerCase().includes(q);
      })
      .map((member) => ({ placeholder: true, member_id: member.id }));
  }, [hasFeeSettingsForYear, paidFilter, fees, members, search]);

  const stats = useMemo(() => {
    const totalDue = fees.reduce((sum, fee) => sum + fee.amount_due, 0);
    const totalPaid = fees.reduce(
      (sum, fee) => sum + (fee.is_paid ? fee.amount_paid ?? fee.amount_due : 0),
      0,
    );
    return {
      totalDue,
      totalPaid,
      outstanding: totalDue - totalPaid,
      rate: totalDue ? Math.round((totalPaid / totalDue) * 100) : 0,
    };
  }, [fees]);

  const unpaidMemberIds = useMemo(
    () => fees.filter((fee) => !fee.is_paid).map((fee) => fee.member_id),
    [fees],
  );

  async function handleSendReminder() {
    setIsSendingReminder(true);
    setReminderError(null);
    setReminderResult(null);
    try {
      const result = await sendFeeInvoices(year, { member_ids: unpaidMemberIds });
      setReminderResult(result);
      setFees((current) => {
        const updated = new Map(current.map((fee) => [fee.member_id, fee]));
        result.member_fees.forEach((fee) => updated.set(fee.member_id, fee));
        return Array.from(updated.values());
      });
    } catch (err) {
      setReminderError(err.detail || "Failed to send reminders");
    } finally {
      setIsSendingReminder(false);
    }
  }

  async function patchFee(feeId, payload) {
    setRowErrors((current) => ({ ...current, [feeId]: null }));
    try {
      const updated = await updateMemberFee(feeId, payload);
      setFees((current) => current.map((fee) => (fee.id === feeId ? updated : fee)));
    } catch (err) {
      setRowErrors((current) => ({
        ...current,
        [feeId]: err.detail || "Failed to update fee",
      }));
    }
  }

  function handleTogglePaid(fee) {
    const nextIsPaid = !fee.is_paid;
    patchFee(fee.id, nextIsPaid ? { is_paid: true, amount_paid: fee.amount_due } : { is_paid: false });
  }

  function handlePaidDateChange(fee, value) {
    patchFee(fee.id, { paid_date: value || null });
  }

  function handleAmountPaidBlur(fee, value) {
    const amount = Number(value);
    if (value === "" || Number.isNaN(amount) || amount === (fee.amount_paid ?? fee.amount_due)) return;
    patchFee(fee.id, { amount_paid: amount });
  }

  function handleNotesBlur(fee, value) {
    if (value === (fee.notes || "")) return;
    patchFee(fee.id, { notes: value });
  }

  function handleTierChange(fee, value) {
    patchFee(fee.id, { price_type: value });
  }

  function handleAmountDueBlur(fee, value) {
    const amount = Number(value);
    if (value === "" || Number.isNaN(amount) || amount === fee.amount_due) return;
    patchFee(fee.id, { amount_due: amount });
  }

  function handleChannelChange(fee, value) {
    const payload = { last_channel: value };
    if (value === "manual") {
      payload.invoice_sent = true;
    }
    patchFee(fee.id, payload);
  }

  function handleInvoiceSentChange(fee, checked) {
    patchFee(fee.id, { invoice_sent: checked });
  }

  if (!canRead) {
    return <p role="alert">You do not have permission to view fee tracking.</p>;
  }

  return (
    <div>
      <div className="flex items-end gap-4 flex-wrap mb-5">
        <div>
          <label htmlFor="fee-tracking-year" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
            Rotary year
          </label>
          <select
            id="fee-tracking-year"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            className={`${SELECT_CLASS} min-w-[130px]`}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {rotaryYearLabel(y)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fee-tracking-paid-filter" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
            Status
          </label>
          <select
            id="fee-tracking-paid-filter"
            value={paidFilter}
            onChange={(event) => setPaidFilter(event.target.value)}
            className={`${SELECT_CLASS} min-w-[130px]`}
          >
            {PAID_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="w-[220px]">
          <label htmlFor="fee-tracking-search" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
            Search member
          </label>
          <input
            id="fee-tracking-search"
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name…"
            className="w-full border border-[var(--color-card-border)] rounded-lg px-3 py-2 text-sm"
          />
        </div>
        {canManage && (
          <button
            type="button"
            onClick={handleSendReminder}
            disabled={isSendingReminder || unpaidMemberIds.length === 0}
            className="border border-[var(--color-brand-blue)] bg-white text-[var(--color-brand-blue)] rounded-lg px-4 py-2 text-[13.5px] font-semibold cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSendingReminder ? "Sending…" : `Send reminder to unpaid (${unpaidMemberIds.length})`}
          </button>
        )}
      </div>

      {reminderError && <p role="alert">{reminderError}</p>}
      {reminderResult && (
        <p role="status" className="text-sm text-[var(--color-muted-text)] mb-3">
          Reminders sent: {reminderResult.sent_count}, failed: {reminderResult.failed_count}.
        </p>
      )}

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-5">
            <StatCard label="Total due" value={`${stats.totalDue.toLocaleString()}`} valueClass="text-[var(--color-brand-blue-dark)]" />
            <StatCard label="Collected" value={`${stats.totalPaid.toLocaleString()}`} valueClass="text-[var(--color-tone-teal-text)]" />
            <StatCard label="Outstanding" value={`${stats.outstanding.toLocaleString()}`} valueClass="text-[var(--color-tone-rose-text)]" />
            <StatCard label="Collection rate" value={`${stats.rate}%`} valueClass="text-[var(--color-brand-blue-dark)]" />
          </div>

          <Card variant="default" className="!p-0 !rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left" style={{ minWidth: 920 }}>
                <thead>
                  <tr className="bg-[var(--color-border-light)]">
                    {["Member", "Tier", "Due", "Paid", "Status", "Paid date", "Invoice", "Channel", "Notes"].map(
                      (label) => (
                        <th
                          key={label}
                          className="text-left px-3.5 py-3 text-xs font-bold text-[var(--color-muted-text)] border-b border-[var(--color-card-border)]"
                        >
                          {label}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visibleFees.map((fee) => (
                    <tr key={fee.id} className="border-b border-[var(--color-border-light)]">
                      <td className="px-3.5 py-2.5 whitespace-nowrap text-sm">{memberName(fee.member_id)}</td>
                      <td className="px-3.5 py-2.5">
                        <select
                          aria-label={`Tier for ${memberName(fee.member_id)}`}
                          value={fee.price_type}
                          disabled={!canManage}
                          onChange={(event) => handleTierChange(fee, event.target.value)}
                          className="border border-[var(--color-card-border)] rounded-md px-2 py-1 text-sm"
                        >
                          {TIER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          aria-label={`Due amount for ${memberName(fee.member_id)}`}
                          defaultValue={fee.amount_due}
                          disabled={!canManage}
                          onBlur={(event) => handleAmountDueBlur(fee, event.target.value)}
                          className="w-20 border border-[var(--color-card-border)] rounded-md px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-3.5 py-2.5">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          aria-label={`Amount paid by ${memberName(fee.member_id)}`}
                          defaultValue={fee.amount_paid ?? ""}
                          disabled={!fee.is_paid || !canManage}
                          onBlur={(event) => handleAmountPaidBlur(fee, event.target.value)}
                          className="w-20 border border-[var(--color-card-border)] rounded-md px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-3.5 py-2.5">
                        <button
                          type="button"
                          aria-label={`Mark ${memberName(fee.member_id)} paid`}
                          onClick={() => handleTogglePaid(fee)}
                          disabled={!canManage}
                          className={`rounded-full px-2.5 py-1 text-xs font-bold border-none cursor-pointer disabled:cursor-not-allowed ${
                            fee.is_paid
                              ? "bg-[var(--tone-teal-bg)] text-[var(--color-tone-teal-text)]"
                              : "bg-[var(--tone-amber-bg)] text-[var(--color-tone-amber-text)]"
                          }`}
                        >
                          {fee.is_paid ? "Paid" : "Pending"}
                        </button>
                        {rowErrors[fee.id] && (
                          <div role="alert" className="text-xs text-[#b23b3b] mt-1">
                            {rowErrors[fee.id]}
                          </div>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <input
                          type="date"
                          aria-label={`Paid date for ${memberName(fee.member_id)}`}
                          value={fee.paid_date || ""}
                          disabled={!fee.is_paid || !canManage}
                          onChange={(event) => handlePaidDateChange(fee, event.target.value)}
                          className="border border-[var(--color-card-border)] rounded-md px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-3.5 py-2.5 text-center">
                        <input
                          type="checkbox"
                          aria-label={`Invoice sent for ${memberName(fee.member_id)}`}
                          checked={Boolean(fee.invoice_sent_at)}
                          disabled={!canManage}
                          onChange={(event) => handleInvoiceSentChange(fee, event.target.checked)}
                        />
                      </td>
                      <td className="px-3.5 py-2.5">
                        <select
                          aria-label={`Channel for ${memberName(fee.member_id)}`}
                          value={fee.last_channel || "email"}
                          disabled={!canManage}
                          onChange={(event) => handleChannelChange(fee, event.target.value)}
                          className="border border-[var(--color-card-border)] rounded-md px-2 py-1 text-sm"
                        >
                          {CHANNEL_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <input
                          type="text"
                          aria-label={`Notes for ${memberName(fee.member_id)}`}
                          defaultValue={fee.notes || ""}
                          disabled={!canManage}
                          onBlur={(event) => handleNotesBlur(fee, event.target.value)}
                          className="w-32 border border-[var(--color-card-border)] rounded-md px-2 py-1 text-sm"
                        />
                      </td>
                    </tr>
                  ))}
                  {placeholderRows.map((row) => (
                    <tr key={`placeholder-${row.member_id}`} className="border-b border-[var(--color-border-light)]">
                      <td className="px-3.5 py-2.5 text-sm">{memberName(row.member_id)}</td>
                      <td colSpan={8} className="px-3.5 py-2.5 text-sm text-[var(--color-muted-text)]">
                        Not yet invoiced for {rotaryYearLabel(year)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <div className="mt-2.5 text-sm text-[var(--color-muted-text)]">
            Showing {visibleFees.length + placeholderRows.length} member(s)
          </div>

          {fees.length === 0 && placeholderRows.length === 0 && (
            <p className="text-sm text-[var(--color-muted-text)] mt-3">
              No fee records for {rotaryYearLabel(year)} yet.
            </p>
          )}
        </>
      )}
    </div>
  );
}

const PRICE_FIELD_BY_TIER = {
  early_bird: { false: "early_bird_single_price", true: "early_bird_couple_price" },
  full: { false: "full_single_price", true: "full_couple_price" },
};

function FeeRunTab() {
  const { canWrite: canManage } = useAccess("fees.run");
  const { yearOptions, selectedYear: year, setSelectedYear: setYear } = useRotaryYears();
  const [members, setMembers] = useState([]);
  const [feeSettings, setFeeSettings] = useState(null);
  const [memberFees, setMemberFees] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [memberTierById, setMemberTierById] = useState({});
  // Story 16.13: per-member due-amount override, keyed by member id, raw
  // input string. Undefined means "use the schedule price for this tier" —
  // required (not just optional) once the tier is Sponsored, since there is
  // no schedule price to fall back to.
  const [memberDueOverrideById, setMemberDueOverrideById] = useState({});

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [generateResult, setGenerateResult] = useState(null);

  const [isConfirmingSend, setIsConfirmingSend] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [sendResult, setSendResult] = useState(null);

  const [emailErrorByMember, setEmailErrorByMember] = useState({});
  const [sendingEmailMemberId, setSendingEmailMemberId] = useState(null);

  async function loadData() {
    setIsLoading(true);
    setLoadError(null);
    setGenerateResult(null);
    setSendResult(null);
    try {
      const [membersData, feesData] = await Promise.all([
        listMembers({ active_in_rotary_year: year, is_honorary: false }),
        listMemberFeesForYear(year),
      ]);
      setMembers(membersData);
      setMemberFees(feesData);
      setSelectedMemberIds([]);
      setMemberTierById({});
      setMemberDueOverrideById({});

      try {
        setFeeSettings(await getFeeSettings(year));
      } catch (err) {
        if (err.status === 404) {
          setFeeSettings(null);
        } else {
          throw err;
        }
      }
    } catch (err) {
      setLoadError(err.detail || "Failed to load fee run data");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!canManage) {
      setIsLoading(false);
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, canManage]);

  const feesByMemberId = useMemo(() => {
    const map = new Map();
    memberFees.forEach((fee) => map.set(fee.member_id, fee));
    return map;
  }, [memberFees]);

  const unpaidMembers = useMemo(
    () => members.filter((member) => !feesByMemberId.get(member.id)?.is_paid),
    [members, feesByMemberId],
  );

  function tierFor(memberId) {
    return memberTierById[memberId] || "early_bird";
  }

  function previewAmount(member) {
    if (!feeSettings) return null;
    const tier = tierFor(member.id);
    if (tier === "sponsored") return null;
    const field = PRICE_FIELD_BY_TIER[tier][String(member.is_couple)];
    return feeSettings[field];
  }

  // Story 16.13: the due amount actually used for this member — the admin's
  // typed override if present, otherwise the schedule price for their tier
  // (blank for Sponsored, which has no schedule price).
  function dueValueFor(member) {
    const override = memberDueOverrideById[member.id];
    if (override !== undefined) return override;
    const preview = previewAmount(member);
    return preview !== null ? String(preview) : "";
  }

  function setMemberDueOverride(memberId, value) {
    setMemberDueOverrideById((current) => ({ ...current, [memberId]: value }));
  }

  function toggleMemberSelected(memberId) {
    setSelectedMemberIds((current) =>
      current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId],
    );
  }

  const allSelected = unpaidMembers.length > 0 && unpaidMembers.every((m) => selectedMemberIds.includes(m.id));

  // Story 16.13: Total Due for the currently selected/edited members —
  // recomputed from each row's live tier/override, not the original
  // schedule defaults.
  const selectedTotalDue = useMemo(
    () =>
      unpaidMembers
        .filter((member) => selectedMemberIds.includes(member.id))
        .reduce((sum, member) => sum + (Number(dueValueFor(member)) || 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unpaidMembers, selectedMemberIds, memberTierById, memberDueOverrideById, feeSettings],
  );

  const selectedSponsoredMissingAmount = unpaidMembers
    .filter((member) => selectedMemberIds.includes(member.id))
    .filter((member) => tierFor(member.id) === "sponsored" && dueValueFor(member) === "")
    .map((member) => `${member.first_name} ${member.last_name}`);

  function toggleSelectAll() {
    setSelectedMemberIds(allSelected ? [] : unpaidMembers.map((m) => m.id));
  }

  function setMemberTier(memberId, tier) {
    setMemberTierById((current) => ({ ...current, [memberId]: tier }));
    // Switching tiers invalidates any previously typed override — clear it
    // so the amount recomputes from the new tier's own schedule price (or
    // blank, for Sponsored).
    setMemberDueOverrideById((current) => {
      if (!(memberId in current)) return current;
      const next = { ...current };
      delete next[memberId];
      return next;
    });
  }

  async function handleGenerate() {
    if (selectedSponsoredMissingAmount.length > 0) {
      setGenerateError(
        `Enter a Sponsored amount for: ${selectedSponsoredMissingAmount.join(", ")}`,
      );
      return;
    }

    setIsGenerating(true);
    setGenerateError(null);
    setGenerateResult(null);
    try {
      const result = await createFeeRun({
        rotary_year: year,
        member_tiers: unpaidMembers
          .filter((member) => selectedMemberIds.includes(member.id))
          .map((member) => {
            const tier = tierFor(member.id);
            const override = memberDueOverrideById[member.id];
            const assignment = { member_id: member.id, price_type: tier };
            if (override !== undefined || tier === "sponsored") {
              assignment.amount_due = Number(dueValueFor(member));
            }
            return assignment;
          }),
      });
      setGenerateResult(result);
      setMemberFees(result.member_fees);
    } catch (err) {
      setGenerateError(err.detail || "Failed to generate fee run");
    } finally {
      setIsGenerating(false);
    }
  }

  const unpaidCount = memberFees.filter((fee) => !fee.is_paid).length;
  const paidSkipCount = memberFees.filter((fee) => fee.is_paid).length;

  function handleReviewSend() {
    setSendError(null);
    setSendResult(null);
    setIsConfirmingSend(true);
  }

  async function handleConfirmSend() {
    setIsSending(true);
    setSendError(null);
    try {
      const result = await sendFeeInvoices(year, {});
      setSendResult(result);
      setMemberFees(result.member_fees);
      setIsConfirmingSend(false);
    } catch (err) {
      setSendError(err.detail || "Failed to send invoices");
    } finally {
      setIsSending(false);
    }
  }

  async function handleSendSingleEmail(memberId) {
    setEmailErrorByMember((current) => ({ ...current, [memberId]: null }));
    setSendingEmailMemberId(memberId);
    try {
      const result = await sendFeeInvoices(year, { member_ids: [memberId] });
      setMemberFees((current) => {
        const updated = new Map(current.map((fee) => [fee.member_id, fee]));
        result.member_fees.forEach((fee) => updated.set(fee.member_id, fee));
        return Array.from(updated.values());
      });
      if (result.failed_count > 0) {
        setEmailErrorByMember((current) => ({
          ...current,
          [memberId]: "Failed to send — check the member has an email on file",
        }));
      }
    } catch (err) {
      setEmailErrorByMember((current) => ({
        ...current,
        [memberId]: err.detail || "Failed to send email",
      }));
    } finally {
      setSendingEmailMemberId(null);
    }
  }

  if (!canManage) {
    return <p role="alert">You do not have permission to view fee runs.</p>;
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <Card variant="default" className="!p-6 !rounded-2xl">
        <div className="text-base font-bold text-[var(--color-brand-blue-dark)] mb-1">
          1 · Choose year &amp; schedule
        </div>
        <p className="text-[13px] text-[var(--color-muted-text)] mb-3.5">
          Uses the price tiers defined in Settings for the selected Rotary year.
        </p>
        <div className="flex items-center gap-4 flex-wrap">
          <select
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            className={`${SELECT_CLASS} min-w-[130px]`}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {rotaryYearLabel(y)}
              </option>
            ))}
          </select>
          {feeSettings && (
            <div className="flex gap-2.5 flex-wrap">
              {[
                ["Early Bird — Single", feeSettings.early_bird_single_price],
                ["Early Bird — Couple", feeSettings.early_bird_couple_price],
                ["Full — Single", feeSettings.full_single_price],
                ["Full — Couple", feeSettings.full_couple_price],
              ].map(([label, amount]) => (
                <div
                  key={label}
                  className="bg-[var(--color-brand-blue-light)] rounded-full px-3.5 py-1.5 text-[13px] text-[var(--color-brand-blue-dark)] font-semibold"
                >
                  {label} · {amount} {feeSettings.currency}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && !feeSettings && (
        <p role="alert">
          No fee settings configured for {rotaryYearLabel(year)}. Set the 4 prices on the Settings
          tab before generating a run.
        </p>
      )}

      {!isLoading && !loadError && feeSettings && (
        <>
          <Card variant="default" className="!p-6 !rounded-2xl">
            <div className="text-base font-bold text-[var(--color-brand-blue-dark)] mb-1">
              2 · Review members &amp; assign tiers
            </div>
            <div className="text-[13px] text-[var(--color-muted-text)] mb-3.5">
              {selectedMemberIds.length} of {unpaidMembers.length} selected ·{" "}
              <button
                type="button"
                onClick={toggleSelectAll}
                className="font-semibold text-[var(--color-brand-blue)] bg-transparent border-none cursor-pointer p-0"
              >
                {allSelected ? "Clear all" : "Select all"}
              </button>
              {selectedMemberIds.length > 0 && (
                <>
                  {" "}
                  · Total due:{" "}
                  <span className="font-semibold text-[var(--color-brand-blue-dark)]">
                    {selectedTotalDue.toLocaleString()} {feeSettings.currency}
                  </span>
                </>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left" style={{ minWidth: 480 }}>
                <thead>
                  <tr className="bg-[var(--color-border-light)]">
                    <th className="px-3.5 py-2.5 border-b border-[var(--color-card-border)] w-8" />
                    <th className="text-left px-3.5 py-2.5 text-xs font-bold text-[var(--color-muted-text)] border-b border-[var(--color-card-border)]">
                      Member
                    </th>
                    <th className="text-left px-3.5 py-2.5 text-xs font-bold text-[var(--color-muted-text)] border-b border-[var(--color-card-border)]">
                      Tier
                    </th>
                    <th className="text-left px-3.5 py-2.5 text-xs font-bold text-[var(--color-muted-text)] border-b border-[var(--color-card-border)]">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {unpaidMembers.map((member) => (
                    <tr key={member.id} className="border-b border-[var(--color-border-light)]">
                      <td className="px-3.5 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Select ${member.first_name} ${member.last_name}`}
                          checked={selectedMemberIds.includes(member.id)}
                          onChange={() => toggleMemberSelected(member.id)}
                        />
                      </td>
                      <td className="px-3.5 py-2 text-sm">
                        {member.first_name} {member.last_name}
                        {member.is_couple && (
                          <span className="ml-2 rounded-full bg-[var(--color-brand-blue-light)] text-[var(--color-brand-blue)] text-[11px] font-bold px-2 py-0.5">
                            Couple
                          </span>
                        )}
                      </td>
                      <td className="px-3.5 py-2">
                        <select
                          aria-label={`Tier for ${member.first_name} ${member.last_name}`}
                          value={tierFor(member.id)}
                          onChange={(event) => setMemberTier(member.id, event.target.value)}
                          className="border border-[var(--color-card-border)] rounded-md px-2 py-1 text-sm"
                        >
                          {TIER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3.5 py-2">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            aria-label={`Amount for ${member.first_name} ${member.last_name}`}
                            placeholder={tierFor(member.id) === "sponsored" ? "Custom price" : undefined}
                            value={dueValueFor(member)}
                            onChange={(event) => setMemberDueOverride(member.id, event.target.value)}
                            className="w-24 border border-[var(--color-card-border)] rounded-md px-2 py-1 text-sm"
                          />
                          <span className="text-sm text-[var(--color-muted-text)]">{feeSettings.currency}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card variant="default" className="!p-6 !rounded-2xl flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-base font-bold text-[var(--color-brand-blue-dark)]">3 · Generate &amp; send</div>
              {generateError && <p role="alert">{generateError}</p>}
              {generateResult && (
                <p role="status" className="text-sm text-[var(--color-muted-text)] mt-1">
                  Generated: {generateResult.created_count} created, {generateResult.updated_count} updated,{" "}
                  {generateResult.skipped_paid_count} already-paid skipped.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || selectedMemberIds.length === 0}
              className="border-none rounded-full px-6 py-2.5 text-sm font-semibold text-white bg-[var(--color-brand-blue)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isGenerating ? "Generating…" : `Generate fee run (${selectedMemberIds.length})`}
            </button>
          </Card>

          <Card variant="default" className="!p-6 !rounded-2xl">
            <div className="text-base font-bold text-[var(--color-brand-blue-dark)] mb-1">Send invoices</div>
            <p className="text-[13px] text-[var(--color-muted-text)] mb-3.5">
              {unpaidCount} unpaid member{unpaidCount === 1 ? "" : "s"} will receive an invoice by email.{" "}
              {paidSkipCount} already-paid member{paidSkipCount === 1 ? "" : "s"} will be skipped.
            </p>

            {sendError && <p role="alert">{sendError}</p>}
            {sendResult && (
              <p role="status" className="text-sm text-[var(--color-muted-text)]">
                Sent: {sendResult.sent_count}, skipped (paid): {sendResult.skipped_paid_count}, failed:{" "}
                {sendResult.failed_count}.
              </p>
            )}

            {!isConfirmingSend && (
              <button
                type="button"
                onClick={handleReviewSend}
                disabled={unpaidCount === 0}
                className="border-none rounded-full px-6 py-2.5 text-sm font-semibold text-white bg-[var(--color-brand-blue)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Send invoices ({unpaidCount})
              </button>
            )}

            {memberFees.filter((fee) => !fee.is_paid).length > 0 && (
              <div className="overflow-x-auto mt-4">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-[var(--color-border-light)]">
                      {["Member", "Status", "Invoice sent", "Send email"].map((label) => (
                        <th
                          key={label}
                          className="text-left px-3.5 py-2.5 text-xs font-bold text-[var(--color-muted-text)] border-b border-[var(--color-card-border)]"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {memberFees
                      .filter((fee) => !fee.is_paid)
                      .map((fee) => (
                        <tr key={fee.id} className="border-b border-[var(--color-border-light)]">
                          <td className="px-3.5 py-2 text-sm">
                            {memberDisplayName(members, fee.member_id)}
                          </td>
                          <td className="px-3.5 py-2 text-sm text-[var(--color-muted-text)]">
                            {fee.amount_due} {feeSettings.currency} ({fee.price_type})
                          </td>
                          <td className="px-3.5 py-2 text-sm text-[var(--color-muted-text)]">
                            {fee.invoice_send_count > 0
                              ? `${fee.last_channel} × ${fee.invoice_send_count}`
                              : "Not sent yet"}
                          </td>
                          <td className="px-3.5 py-2">
                            <button
                              type="button"
                              onClick={() => handleSendSingleEmail(fee.member_id)}
                              disabled={sendingEmailMemberId === fee.member_id}
                              className="border border-[var(--color-card-border)] bg-white rounded-md px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-blue)] cursor-pointer"
                            >
                              {sendingEmailMemberId === fee.member_id ? "Sending…" : "Send email"}
                            </button>
                            {emailErrorByMember[fee.member_id] && (
                              <div role="alert" className="text-xs text-[#b23b3b] mt-1">
                                {emailErrorByMember[fee.member_id]}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {isConfirmingSend && (
              <div className="modal-overlay" onClick={() => setIsConfirmingSend(false)}>
                <div
                  className="modal-dialog !rounded-2xl !max-w-[420px] !text-[15px]"
                  role="alertdialog"
                  onClick={(event) => event.stopPropagation()}
                >
                  <h2 className="text-[19px] font-semibold text-[var(--color-brand-blue-dark)]">Confirm send</h2>
                  <p className="text-[var(--color-muted-text-strong)]">
                    This will email <strong>{unpaidCount}</strong> unpaid member
                    {unpaidCount === 1 ? "" : "s"} ({paidSkipCount} already-paid member
                    {paidSkipCount === 1 ? "" : "s"} skipped). This cannot be undone.
                  </p>
                  <div className="flex justify-end gap-3 mt-5">
                    <button
                      type="button"
                      onClick={() => setIsConfirmingSend(false)}
                      disabled={isSending}
                      className="rounded-full px-6 py-2.5 text-[14.5px] font-semibold text-[var(--color-muted-text-strong)] bg-[var(--color-border-light)] hover:bg-[var(--color-card-border)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmSend}
                      disabled={isSending}
                      className="rounded-full px-6 py-2.5 text-[14.5px] font-semibold text-white bg-[var(--color-brand-blue)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {isSending ? "Sending…" : "Confirm send"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function memberDisplayName(members, memberId) {
  const member = members.find((m) => m.id === memberId);
  return member ? `${member.first_name} ${member.last_name}` : "Unknown member";
}

function formatCurrency(value, currency) {
  const formatted = Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return currency ? `${formatted} ${currency}` : formatted;
}

function StatisticsTab() {
  const { canRead } = useAccess("fees.statistics");
  const { yearOptions, selectedYear: year, setSelectedYear: setYear } = useRotaryYears();
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyError, setHistoryError] = useState(null);
  const [reportFormat, setReportFormat] = useState("pdf");
  const [reportError, setReportError] = useState(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  async function handleGenerateReport() {
    setIsGeneratingReport(true);
    setReportError(null);
    try {
      const { blob, filename } = await generateMemberFeeStatisticsReport(reportFormat, {
        rotaryYear: year,
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

  useEffect(() => {
    if (!canRead) return;
    fetchMemberFeeStatisticsHistory()
      .then((data) => setHistory(data))
      .catch((err) => setHistoryError(err.detail || "Failed to load fee history"));
  }, [canRead]);

  if (!canRead) {
    return <p role="alert">You do not have permission to view fee statistics.</p>;
  }

  const amountCollectedData = history.map((row) => ({
    year: rotaryYearLabel(row.rotary_year),
    total: row.total_collected,
  }));

  const payingMembersData = history.map((row) => ({
    year: rotaryYearLabel(row.rotary_year),
    paid: row.paid_count,
    zero: row.zero_count,
  }));

  return (
    <div>
      <div className="flex items-end gap-4 flex-wrap mb-5">
        <div>
          <label htmlFor="fee-stats-year" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
            Rotary year
          </label>
          <select
            id="fee-stats-year"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            className={`${SELECT_CLASS} min-w-[130px]`}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {rotaryYearLabel(y)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label htmlFor="report-format" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
              Generate report
            </label>
            <select
              id="report-format"
              value={reportFormat}
              onChange={(event) => setReportFormat(event.target.value)}
              className={SELECT_CLASS}
            >
              <option value="pdf">PDF</option>
              <option value="pptx">PowerPoint (PPTX)</option>
            </select>
          </div>
          <button
            type="button"
            onClick={handleGenerateReport}
            disabled={isGeneratingReport}
            className="border border-[var(--color-brand-blue)] bg-white text-[var(--color-brand-blue)] rounded-lg px-4 py-2 text-[13.5px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGeneratingReport ? "Generating…" : "Generate Report"}
          </button>
        </div>
      </div>
      {reportError && <p role="alert">{reportError}</p>}

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && stats && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-5">
            <StatCard
              label={`Average fee per active member — ${rotaryYearLabel(year)}`}
              value={formatCurrency(stats.average_fee_per_active_member, stats.currency)}
              valueClass="text-[var(--color-brand-blue-dark)]"
              bg="var(--tone-blue-bg)"
            />
            <StatCard
              label={`Total collected — ${rotaryYearLabel(year)}`}
              value={formatCurrency(stats.total_collected, stats.currency)}
              valueClass="text-[var(--color-tone-teal-text)]"
              bg="var(--tone-teal-bg)"
            />
            <StatCard
              label={`Total outstanding — ${rotaryYearLabel(year)}`}
              value={formatCurrency(stats.total_outstanding, stats.currency)}
              valueClass="text-[var(--color-tone-rose-text)]"
              bg="var(--tone-rose-bg)"
            />
          </div>

          <p className="text-sm text-[var(--color-muted-text)] mb-5">
            {stats.paid_count} paid, {stats.unpaid_count} unpaid, {stats.total_members} total member
            {stats.total_members === 1 ? "" : "s"} billed. Collection rate {stats.collection_rate.toFixed(1)}%.
          </p>

          {historyError && <p role="alert">{historyError}</p>}

          {!historyError && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card variant="default" className="!p-6 !rounded-2xl">
                <div className="text-base font-bold text-[var(--color-brand-blue-dark)] mb-3">
                  Amount collected over years
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={amountCollectedData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="year" />
                    <YAxis />
                    <Tooltip formatter={(value) => formatCurrency(value, stats.currency)} />
                    <Bar dataKey="total" fill="#17458f" name="Total collected" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card variant="default" className="!p-6 !rounded-2xl">
                <div className="text-base font-bold text-[var(--color-brand-blue-dark)] mb-3">
                  Paying members over years
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={payingMembersData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="year" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="paid" name="Paid" fill="#17458f" />
                    <Bar dataKey="zero" name="Zero payment" fill="#f7a81b" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const EMPTY_FORM = {
  early_bird_single_price: "",
  early_bird_couple_price: "",
  full_single_price: "",
  full_couple_price: "",
  currency: "HKD",
};

function SettingsTab() {
  const { canRead } = useAccess("fees.settings");
  const { canWrite: canManage } = useAccess("fees.settings");
  const { yearOptions: centralYearOptions } = useRotaryYears();

  const [existingYears, setExistingYears] = useState([]);
  const [addedYears, setAddedYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState(currentRotaryYear());
  const [form, setForm] = useState(EMPTY_FORM);
  const [existsForYear, setExistsForYear] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [newYearInput, setNewYearInput] = useState(String(currentRotaryYear() + 1));
  const [addYearError, setAddYearError] = useState(null);

  async function loadYears() {
    try {
      const data = await listFeeSettings();
      setExistingYears(data.map((row) => row.rotary_year));
    } catch {
      // Non-fatal — the selector still works for a fresh year.
    }
  }

  async function loadYear(year) {
    setIsLoading(true);
    setLoadError(null);
    setSaveSuccess(false);
    try {
      const data = await getFeeSettings(year);
      setForm({
        early_bird_single_price: data.early_bird_single_price,
        early_bird_couple_price: data.early_bird_couple_price,
        full_single_price: data.full_single_price,
        full_couple_price: data.full_couple_price,
        currency: data.currency,
      });
      setExistsForYear(true);
    } catch (err) {
      if (err.status === 404) {
        setForm(EMPTY_FORM);
        setExistsForYear(false);
      } else {
        setLoadError(err.detail || "Failed to load fee settings");
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    loadYears();
    loadYear(selectedYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, canRead]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);
    setIsSaving(true);

    const payload = {
      early_bird_single_price: Number(form.early_bird_single_price),
      early_bird_couple_price: Number(form.early_bird_couple_price),
      full_single_price: Number(form.full_single_price),
      full_couple_price: Number(form.full_couple_price),
      currency: form.currency,
    };

    try {
      if (existsForYear) {
        await updateFeeSettings(selectedYear, payload);
      } else {
        await createFeeSettings({ rotary_year: selectedYear, ...payload });
      }
      setSaveSuccess(true);
      setExistsForYear(true);
      await loadYears();
    } catch (err) {
      setSaveError(err.detail || "Failed to save fee settings");
    } finally {
      setIsSaving(false);
    }
  }

  const explicitlyAllowedFutureYears = new Set([...addedYears, ...existingYears]);
  const yearOptions = Array.from(
    new Set([...centralYearOptions, ...existingYears, ...addedYears]),
  )
    .filter((year) => year <= currentRotaryYear() || explicitlyAllowedFutureYears.has(year))
    .sort((a, b) => b - a);

  function handleAddYear(event) {
    event.preventDefault();
    setAddYearError(null);
    const year = Number(newYearInput);
    if (!Number.isInteger(year) || newYearInput.trim() === "") {
      setAddYearError("Enter a valid year");
      return;
    }
    if (yearOptions.includes(year)) {
      setAddYearError("That year is already in the list");
      return;
    }
    setAddedYears((current) => [...current, year]);
    setSelectedYear(year);
    setNewYearInput("");
  }

  if (!canRead) {
    return <p role="alert">You do not have permission to view fee settings.</p>;
  }

  const fields = [
    { key: "early_bird_single_price", label: "Early Bird — Single" },
    { key: "early_bird_couple_price", label: "Early Bird — Couple" },
    { key: "full_single_price", label: "Full — Single" },
    { key: "full_couple_price", label: "Full — Couple" },
  ];

  return (
    <Card variant="default" className="!p-6 !rounded-2xl max-w-[640px]">
      <div className="flex justify-between items-center gap-3 flex-wrap mb-1">
        <div className="text-base font-bold text-[var(--color-brand-blue-dark)]">Fee schedule</div>
        <label htmlFor="fee-settings-year" className="sr-only">
          Rotary year
        </label>
        <select
          id="fee-settings-year"
          value={selectedYear}
          onChange={(event) => setSelectedYear(Number(event.target.value))}
          className="border border-[var(--color-card-border)] rounded-lg px-3 py-1.5 text-[13.5px] bg-white form-select"
        >
          {yearOptions.map((year) => (
            <option key={year} value={year}>
              {rotaryYearLabel(year)}
              {existingYears.includes(year) ? "" : " (not set)"}
            </option>
          ))}
        </select>
      </div>
      <p className="text-[13px] text-[var(--color-muted-text)] mb-[18px]">
        Define the 4 annual prices members are billed under for this Rotary year. Early-bird vs
        full is always a manual choice when a fee run is triggered — never based on a deadline.
      </p>

      {canManage && (
        <form onSubmit={handleAddYear} className="flex items-center gap-2 mb-5 flex-wrap">
          <label htmlFor="fee-settings-add-year" className="text-[13px] text-[var(--color-muted-text)]">
            Add a year
          </label>
          <input
            id="fee-settings-add-year"
            type="number"
            step="1"
            placeholder={rotaryYearLabel(currentRotaryYear() + 1)}
            title="Enter the starting year only, e.g. 2027 for 2027–2028"
            value={newYearInput}
            onChange={(event) => setNewYearInput(event.target.value)}
            className="w-24 border border-[var(--color-card-border)] rounded-md px-2 py-1.5 text-sm"
          />
          {Number.isInteger(Number(newYearInput)) && newYearInput.trim() !== "" && (
            <span className="text-xs text-[var(--color-muted-text)]">→ {rotaryYearLabel(Number(newYearInput))}</span>
          )}
          <button
            type="submit"
            className="border border-dashed border-[var(--color-muted-text)] bg-transparent rounded-lg px-3 py-1.5 text-[13px] text-[var(--color-muted-text)] cursor-pointer"
          >
            Add year
          </button>
          {addYearError && <span role="alert" className="text-xs text-[#b23b3b]">{addYearError}</span>}
        </form>
      )}

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
          {fields.map((field) => (
            <div
              key={field.key}
              className="flex items-center gap-3 px-3.5 py-3 bg-[var(--color-border-light)] rounded-xl"
            >
              <label htmlFor={`fee-${field.key}`} className="flex-1 text-[13.5px] text-[var(--color-brand-blue-dark)]">
                {field.label}
              </label>
              <input
                id={`fee-${field.key}`}
                type="number"
                step="0.01"
                min="0.01"
                value={form[field.key]}
                onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                required
                disabled={!canManage}
                className="w-28 border border-[var(--color-card-border)] rounded-md px-2.5 py-1.5 text-sm"
              />
            </div>
          ))}

          <div className="flex items-center gap-3 px-3.5 py-3">
            <label htmlFor="fee-currency" className="flex-1 text-[13.5px] text-[var(--color-brand-blue-dark)]">
              Currency
            </label>
            <select
              id="fee-currency"
              value={form.currency}
              onChange={(event) => setForm({ ...form, currency: event.target.value })}
              disabled={!canManage}
              className="border border-[var(--color-card-border)] rounded-md px-2.5 py-1.5 text-sm form-select"
            >
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {currencyLabel(code)}
                </option>
              ))}
            </select>
          </div>

          {saveError && <p role="alert">{saveError}</p>}
          {saveSuccess && <p role="status">Fee settings saved.</p>}
          {canManage && (
            <div className="flex justify-end pt-4 mt-1 border-t border-[var(--color-border-light)]">
              <button
                type="submit"
                disabled={isSaving}
                className="border-none rounded-full px-6 py-2.5 text-sm font-semibold text-white bg-[var(--color-brand-blue)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSaving ? "Saving…" : existsForYear ? "Update prices" : "Save prices"}
              </button>
            </div>
          )}
        </form>
      )}
    </Card>
  );
}

export default function MemberFees() {
  const { canRead: canReadTracking } = useAccess("fees.tracking");
  const { canRead: canReadRun } = useAccess("fees.run");
  const { canRead: canReadStatistics } = useAccess("fees.statistics");
  const { canRead: canReadSettings } = useAccess("fees.settings");

  const permissionByTab = {
    tracking: canReadTracking,
    run: canReadRun,
    statistics: canReadStatistics,
    settings: canReadSettings,
  };

  const availableTabs = TABS.filter((tab) => permissionByTab[tab.key]);

  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab = availableTabs.some((tab) => tab.key === requestedTab)
    ? requestedTab
    : availableTabs[0]?.key;

  function selectTab(key) {
    setSearchParams({ tab: key });
  }

  return (
    <div className="admin-page admin-page-wide">
      <div className="mb-1">
        <h1 className="mb-1">Member Fees</h1>
        <p className="text-sm text-[var(--color-muted-text)]">
          Track dues, run billing cycles, and review collection performance — all in one place.
        </p>
      </div>

      {availableTabs.length === 0 && (
        <p role="alert" className="mt-4">
          You do not have permission to view any part of the Member Fees module.
        </p>
      )}

      {availableTabs.length > 0 && (
        <>
          <TabBar tabs={availableTabs} activeTab={activeTab} onSelect={selectTab} />
          {activeTab === "tracking" && <TrackingTab />}
          {activeTab === "run" && <FeeRunTab />}
          {activeTab === "statistics" && <StatisticsTab />}
          {activeTab === "settings" && <SettingsTab />}
        </>
      )}
    </div>
  );
}
