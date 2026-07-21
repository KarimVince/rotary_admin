import { useEffect, useState } from "react";
import {
  createExchangeRate,
  deleteExchangeRate,
  listExchangeRates,
  updateExchangeRate,
} from "../api/exchangeRates";
import Card from "../components/Card";
import { CURRENCIES, currencyLabel } from "../data/currencies";
import { useAccess } from "../hooks/useAccess";

const EMPTY_FORM = { currency_code: "", rate_to_hkd: "", rate_to_usd: "" };

export default function CurrencyManagement() {
  // Story 12.7: retires the legacy require_treasurer_or_admin role check —
  // matrix-driven now via admin.currencies.
  const { canRead, canWrite: canManage } = useAccess("admin.currencies");

  const [rates, setRates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  async function loadRates() {
    setIsLoading(true);
    try {
      const data = await listExchangeRates();
      setRates(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.detail || "Failed to load exchange rates");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    loadRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead]);

  const usedCurrencyCodes = new Set(rates.map((rate) => rate.currency_code));
  const availableCurrencyOptions = CURRENCIES.filter(
    (code) => !usedCurrencyCodes.has(code),
  );

  function startEdit(rate) {
    setEditingId(rate.id);
    setForm({
      currency_code: rate.currency_code,
      rate_to_hkd: rate.rate_to_hkd,
      rate_to_usd: rate.rate_to_usd,
    });
    setSaveError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError(null);
    setIsSaving(true);

    try {
      if (editingId) {
        await updateExchangeRate(editingId, {
          rate_to_hkd: Number(form.rate_to_hkd),
          rate_to_usd: Number(form.rate_to_usd),
        });
      } else {
        await createExchangeRate({
          currency_code: form.currency_code,
          rate_to_hkd: Number(form.rate_to_hkd),
          rate_to_usd: Number(form.rate_to_usd),
        });
      }
      cancelEdit();
      await loadRates();
    } catch (err) {
      setSaveError(err.detail || "Failed to save exchange rate");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(rate) {
    if (!window.confirm(`Remove the exchange rate for ${rate.currency_code}?`)) {
      return;
    }
    await deleteExchangeRate(rate.id);
    await loadRates();
  }

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>Currencies &amp; exchange rates</h1>
        <p role="alert">You do not have permission to view Currencies.</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <h1>Currencies</h1>
      <p className="mt-1 mb-5 text-sm text-[var(--color-muted-text)]">
        Rates are entered manually by the club and used to convert donation totals to
        HKD/USD for reporting — they are not live market rates. Update them periodically.
      </p>

      {canManage && (
        <Card variant="default" className="!p-6 !rounded-2xl mb-6 max-w-[520px]">
          <form onSubmit={handleSubmit}>
            <h2 className="text-base font-bold text-[var(--color-brand-blue-dark)] mb-3">
              {editingId ? `Edit rate — ${form.currency_code}` : "Add currency rate"}
            </h2>
            <label htmlFor="rate-currency" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
              Currency
            </label>
            <select
              id="rate-currency"
              value={form.currency_code}
              onChange={(event) => setForm({ ...form, currency_code: event.target.value })}
              disabled={Boolean(editingId)}
              required
              className="w-full border border-[var(--color-card-border)] rounded-lg px-3 py-2 text-sm mb-3"
            >
              <option value="">Select a currency…</option>
              {availableCurrencyOptions.map((code) => (
                <option key={code} value={code}>
                  {currencyLabel(code)}
                </option>
              ))}
            </select>
            <label htmlFor="rate-to-hkd" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
              Rate to HKD
            </label>
            <input
              id="rate-to-hkd"
              type="number"
              step="0.000001"
              min="0"
              value={form.rate_to_hkd}
              onChange={(event) => setForm({ ...form, rate_to_hkd: event.target.value })}
              required
              className="w-full border border-[var(--color-card-border)] rounded-lg px-3 py-2 text-sm mb-3"
            />
            <label htmlFor="rate-to-usd" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
              Rate to USD
            </label>
            <input
              id="rate-to-usd"
              type="number"
              step="0.000001"
              min="0"
              value={form.rate_to_usd}
              onChange={(event) => setForm({ ...form, rate_to_usd: event.target.value })}
              required
              className="w-full border border-[var(--color-card-border)] rounded-lg px-3 py-2 text-sm mb-3"
            />
            {saveError && <p role="alert">{saveError}</p>}
            <div className="flex gap-3 mt-3">
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-full px-6 py-2.5 text-[14.5px] font-semibold text-white bg-[var(--color-brand-blue)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSaving ? "Saving…" : editingId ? "Update rate" : "Add rate"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-full px-6 py-2.5 text-[14.5px] font-semibold text-[var(--color-muted-text-strong)] bg-[var(--color-border-light)] hover:bg-[var(--color-card-border)] cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </Card>
      )}

      <h2 className="text-[15px] font-bold text-[var(--color-brand-blue-dark)] mb-2">Rates in use</h2>
      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}
      {!isLoading && !loadError && (
        <Card variant="default" className="!p-0 !rounded-2xl overflow-hidden">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-[var(--color-border-light)]">
                <th className="text-left px-5 py-3 text-xs font-bold text-[var(--color-muted-text)] uppercase tracking-wide">Currency</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-[var(--color-muted-text)] uppercase tracking-wide">Rate to HKD</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-[var(--color-muted-text)] uppercase tracking-wide">Rate to USD</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-[var(--color-muted-text)] uppercase tracking-wide">Last updated</th>
                {canManage && <th className="px-5 py-3" />}
              </tr>
            </thead>
            <tbody>
              {rates.map((rate) => (
                <tr key={rate.id} className="border-t border-[var(--color-border-light)]">
                  <td className="px-5 py-3 text-sm font-semibold text-[#0c2340]">{currencyLabel(rate.currency_code)}</td>
                  <td className="px-5 py-3 text-sm text-[var(--color-muted-text)]">{rate.rate_to_hkd}</td>
                  <td className="px-5 py-3 text-sm text-[var(--color-muted-text)]">{rate.rate_to_usd}</td>
                  <td className="px-5 py-3 text-sm text-[var(--color-muted-text)]">{new Date(rate.updated_at).toLocaleString()}</td>
                  {canManage && (
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => startEdit(rate)}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-blue)] bg-white border border-[var(--color-brand-blue)] cursor-pointer mr-2"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(rate)}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#b23b3b] bg-[var(--tone-rose-bg)] border-none cursor-pointer"
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
