import { useEffect, useMemo, useState } from "react";
import { listMemberFees, updateMemberFee } from "../api/memberFees";
import { getFeeSettings } from "../api/feeSettings";
import { listMembers } from "../api/members";
import { currentRotaryYear, rotaryYearLabel } from "../utils/rotaryYear";
import { useAccess } from "../hooks/useAccess";
import { useFeeYearOptions } from "../hooks/useFeeYearOptions";

const PAID_FILTERS = [
  { value: "", label: "All" },
  { value: "false", label: "Unpaid" },
  { value: "true", label: "Paid" },
];

export default function FeeTracking() {
  const { canRead } = useAccess("fees.tracking");
  const { canWrite: canManage } = useAccess("fees.tracking");
  const { yearOptions } = useFeeYearOptions();

  const [year, setYear] = useState(currentRotaryYear());
  const [paidFilter, setPaidFilter] = useState("");
  const [members, setMembers] = useState([]);
  const [fees, setFees] = useState([]);
  const [hasFeeSettingsForYear, setHasFeeSettingsForYear] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [rowErrors, setRowErrors] = useState({});

  async function loadData() {
    setIsLoading(true);
    setLoadError(null);
    try {
      const filters = { rotary_year: year };
      if (paidFilter !== "") filters.is_paid = paidFilter;
      const [membersData, feesData] = await Promise.all([listMembers(), listMemberFees(filters)]);
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

  // Once fee prices exist for the year, every active member should be
  // visible here — not only members a fee run has already been generated
  // for — so the treasurer sees the full picture before any invoice exists.
  // These placeholder rows are display-only (no id to PATCH against) and are
  // hidden once the "Paid" filter is selected, since they can't be paid yet.
  const placeholderRows = useMemo(() => {
    if (!hasFeeSettingsForYear || paidFilter === "true") return [];
    const billedMemberIds = new Set(fees.map((fee) => fee.member_id));
    return members
      .filter((member) => member.status === "active" && !billedMemberIds.has(member.id))
      .map((member) => ({ placeholder: true, member_id: member.id }));
  }, [hasFeeSettingsForYear, paidFilter, fees, members]);

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
    if (!value || Number.isNaN(amount) || amount === (fee.amount_paid ?? fee.amount_due)) return;
    patchFee(fee.id, { amount_paid: amount });
  }

  function handleNotesBlur(fee, value) {
    if (value === (fee.notes || "")) return;
    patchFee(fee.id, { notes: value });
  }

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>Fee tracking</h1>
        <p role="alert">You do not have permission to view fee tracking.</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <h1>Fee tracking</h1>

      <div className="email-controls-row">
        <div>
          <label htmlFor="fee-tracking-year" className="fee-year-label">
            Rotary year
          </label>
          <select
            id="fee-tracking-year"
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
        </div>
        <div>
          <label htmlFor="fee-tracking-paid-filter">Status</label>
          <select
            id="fee-tracking-paid-filter"
            value={paidFilter}
            onChange={(event) => setPaidFilter(event.target.value)}
          >
            {PAID_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Price tier</th>
              <th>Amount due</th>
              <th>Amount paid</th>
              <th>Paid</th>
              <th>Paid date</th>
              <th>Invoices sent</th>
              <th>Last channel</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {fees.map((fee) => (
              <tr key={fee.id}>
                <td>{memberName(fee.member_id)}</td>
                <td>{fee.price_type}</td>
                <td>{fee.amount_due}</td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    aria-label={`Amount paid by ${memberName(fee.member_id)}`}
                    defaultValue={fee.amount_paid ?? ""}
                    disabled={!fee.is_paid || !canManage}
                    onBlur={(event) => handleAmountPaidBlur(fee, event.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Mark ${memberName(fee.member_id)} paid`}
                    checked={fee.is_paid}
                    disabled={!canManage}
                    onChange={() => handleTogglePaid(fee)}
                  />
                  {rowErrors[fee.id] && <span role="alert">{rowErrors[fee.id]}</span>}
                </td>
                <td>
                  <input
                    type="date"
                    aria-label={`Paid date for ${memberName(fee.member_id)}`}
                    value={fee.paid_date || ""}
                    disabled={!fee.is_paid || !canManage}
                    onChange={(event) => handlePaidDateChange(fee, event.target.value)}
                  />
                </td>
                <td>{fee.invoice_send_count}</td>
                <td>{fee.last_channel || "—"}</td>
                <td>
                  <input
                    type="text"
                    aria-label={`Notes for ${memberName(fee.member_id)}`}
                    defaultValue={fee.notes || ""}
                    disabled={!canManage}
                    onBlur={(event) => handleNotesBlur(fee, event.target.value)}
                  />
                </td>
              </tr>
            ))}
            {placeholderRows.map((row) => (
              <tr key={`placeholder-${row.member_id}`} className="fee-tracking-placeholder-row">
                <td>{memberName(row.member_id)}</td>
                <td colSpan={8}>Not yet invoiced for {rotaryYearLabel(year)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!isLoading && !loadError && fees.length === 0 && placeholderRows.length === 0 && (
        <p className="member-empty-state">No fee records for {rotaryYearLabel(year)} yet.</p>
      )}
    </div>
  );
}
