import { useEffect, useMemo, useState } from "react";
import { createFeeRun, listMemberFees, sendFeeInvoices } from "../api/feeRuns";
import { getFeeSettings } from "../api/feeSettings";
import { listMembers } from "../api/members";
import { currentRotaryYear, rotaryYearLabel } from "../utils/rotaryYear";
import { useAccess } from "../hooks/useAccess";
import { useFeeYearOptions } from "../hooks/useFeeYearOptions";

const PRICE_FIELD_BY_TIER = {
  early_bird: { false: "early_bird_single_price", true: "early_bird_couple_price" },
  full: { false: "full_single_price", true: "full_couple_price" },
};

export default function FeeRunManagement() {
  // Fee Run is entirely a create/send console (no plain read-only use), so
  // it is gated on invoices.manage rather than splitting view vs manage.
  const { canWrite: canManage } = useAccess("fees.run");
  const { yearOptions } = useFeeYearOptions();

  const [year, setYear] = useState(currentRotaryYear());
  const [priceType, setPriceType] = useState("early_bird");
  const [members, setMembers] = useState([]);
  const [feeSettings, setFeeSettings] = useState(null);
  const [memberFees, setMemberFees] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [generateResult, setGenerateResult] = useState(null);

  const [isConfirmingSend, setIsConfirmingSend] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [sendResult, setSendResult] = useState(null);

  const [whatsappErrorByMember, setWhatsappErrorByMember] = useState({});
  const [emailErrorByMember, setEmailErrorByMember] = useState({});
  const [sendingEmailMemberId, setSendingEmailMemberId] = useState(null);

  async function loadData() {
    setIsLoading(true);
    setLoadError(null);
    setGenerateResult(null);
    setSendResult(null);
    try {
      const [membersData, feesData] = await Promise.all([
        listMembers({ status: "active" }),
        listMemberFees(year),
      ]);
      setMembers(membersData);
      setMemberFees(feesData);

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

  function previewAmount(member) {
    if (!feeSettings) return null;
    const field = PRICE_FIELD_BY_TIER[priceType][String(member.is_couple)];
    return feeSettings[field];
  }

  // Already-paid members have nothing actionable left in a fee run (they're
  // always skipped by generate/send) — exclude them from this preview
  // entirely rather than showing a row with no available actions. Payment
  // status/history for them still lives on the Fee tracking page.
  const unpaidMembers = useMemo(
    () => members.filter((member) => !feesByMemberId.get(member.id)?.is_paid),
    [members, feesByMemberId],
  );

  async function handleGenerate() {
    setIsGenerating(true);
    setGenerateError(null);
    setGenerateResult(null);
    try {
      const result = await createFeeRun({
        rotary_year: year,
        price_type: priceType,
        target: "all_members",
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
      const result = await sendFeeInvoices(year, { channel: "email" });
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
      const result = await sendFeeInvoices(year, {
        member_ids: [memberId],
        channel: "email",
      });
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

  async function handleMarkSentViaWhatsapp(memberId) {
    setWhatsappErrorByMember((current) => ({ ...current, [memberId]: null }));
    try {
      const result = await sendFeeInvoices(year, {
        member_ids: [memberId],
        channel: "whatsapp",
      });
      setMemberFees((current) => {
        const updated = new Map(current.map((fee) => [fee.member_id, fee]));
        result.member_fees.forEach((fee) => updated.set(fee.member_id, fee));
        return Array.from(updated.values());
      });
    } catch (err) {
      setWhatsappErrorByMember((current) => ({
        ...current,
        [memberId]: err.detail || "Failed to mark as sent",
      }));
    }
  }

  if (!canManage) {
    return (
      <div className="admin-page">
        <h1>Fee run</h1>
        <p role="alert">You do not have permission to view fee runs.</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <h1>Fee run</h1>
      <p className="admin-page-note">
        Pick the rotary year and manually choose the price tier for this run — early-bird vs
        full is always a manual choice, never based on a deadline.
      </p>

      <div className="email-controls-row">
        <div>
          <label htmlFor="fee-run-year" className="fee-year-label">
            Rotary year
          </label>
          <select
            id="fee-run-year"
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
          <label htmlFor="fee-run-price-type">Price tier for this run</label>
          <select
            id="fee-run-price-type"
            value={priceType}
            onChange={(event) => setPriceType(event.target.value)}
          >
            <option value="early_bird">Early Bird</option>
            <option value="full">Full</option>
          </select>
        </div>
      </div>

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && !feeSettings && (
        <p role="alert">
          No fee settings configured for {rotaryYearLabel(year)}. Set the 4 prices on the Fee
          settings page before generating a run.
        </p>
      )}

      {!isLoading && !loadError && feeSettings && (
        <>
          <h2>Preview — {rotaryYearLabel(year)}</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Current status</th>
                <th>Amount to apply</th>
                <th>Invoice sent</th>
                <th>Send email</th>
                <th>Sent via WhatsApp</th>
              </tr>
            </thead>
            <tbody>
              {unpaidMembers.map((member) => {
                const existing = feesByMemberId.get(member.id);
                const amount = previewAmount(member);
                return (
                  <tr key={member.id}>
                    <td>
                      {member.first_name} {member.last_name}
                      {member.is_couple && <span className="inline-badge">Couple</span>}
                    </td>
                    <td>
                      {existing
                        ? `Unpaid — currently ${existing.amount_due} ${feeSettings.currency} (${existing.price_type})`
                        : "No record yet"}
                    </td>
                    <td>{amount} {feeSettings.currency}</td>
                    <td>
                      {existing && existing.invoice_send_count > 0
                        ? `${existing.last_channel} × ${existing.invoice_send_count} (last: ${new Date(existing.invoice_sent_at).toLocaleString()})`
                        : "Not sent yet"}
                    </td>
                    <td>
                      {existing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSendSingleEmail(member.id)}
                            disabled={sendingEmailMemberId === member.id}
                          >
                            {sendingEmailMemberId === member.id ? "Sending…" : "Send email"}
                          </button>
                          {emailErrorByMember[member.id] && (
                            <span role="alert">{emailErrorByMember[member.id]}</span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {existing ? (
                        <>
                          <input
                            type="checkbox"
                            aria-label={`Mark ${member.first_name} ${member.last_name} sent via WhatsApp`}
                            checked={existing.last_channel === "whatsapp"}
                            onChange={() => handleMarkSentViaWhatsapp(member.id)}
                          />
                          {whatsappErrorByMember[member.id] && (
                            <span role="alert">{whatsappErrorByMember[member.id]}</span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {generateError && <p role="alert">{generateError}</p>}
          {generateResult && (
            <p role="status">
              Generated: {generateResult.created_count} created, {generateResult.updated_count}{" "}
              updated, {generateResult.skipped_paid_count} already-paid skipped.
            </p>
          )}
          <button type="button" onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? "Generating…" : "Generate fee run"}
          </button>

          <h2>Send invoices</h2>
          <p>
            {unpaidCount} unpaid member{unpaidCount === 1 ? "" : "s"} will receive an invoice by
            email. {paidSkipCount} already-paid member{paidSkipCount === 1 ? "" : "s"} will be
            skipped.
          </p>

          {sendError && <p role="alert">{sendError}</p>}
          {sendResult && (
            <p role="status">
              Sent: {sendResult.sent_count}, skipped (paid): {sendResult.skipped_paid_count},
              failed: {sendResult.failed_count}.
            </p>
          )}

          {!isConfirmingSend && (
            <button type="button" onClick={handleReviewSend} disabled={unpaidCount === 0}>
              Send invoices ({unpaidCount})
            </button>
          )}

          {isConfirmingSend && (
            <div className="admin-form" role="alertdialog">
              <h2>Confirm send</h2>
              <p>
                This will email <strong>{unpaidCount}</strong> unpaid member
                {unpaidCount === 1 ? "" : "s"} ({paidSkipCount} already-paid member
                {paidSkipCount === 1 ? "" : "s"} skipped). This cannot be undone.
              </p>
              <button type="button" onClick={handleConfirmSend} disabled={isSending}>
                {isSending ? "Sending…" : "Confirm send"}
              </button>
              <button
                type="button"
                onClick={() => setIsConfirmingSend(false)}
                disabled={isSending}
              >
                Cancel
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
