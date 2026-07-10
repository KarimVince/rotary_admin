import { useEffect, useState } from "react";
import {
  createExchangeRate,
  deleteExchangeRate,
  listExchangeRates,
  updateExchangeRate,
} from "../api/exchangeRates";
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
      <h1>Currencies &amp; exchange rates</h1>
      <p className="admin-page-note">
        Rates are entered manually by the club and used to convert donation totals to
        HKD/USD for reporting — they are not live market rates. Update them periodically.
      </p>

      {canManage && (
        <form className="admin-form" onSubmit={handleSubmit}>
          <h2>{editingId ? `Edit rate — ${form.currency_code}` : "Add currency rate"}</h2>
          <label htmlFor="rate-currency">Currency</label>
          <select
            id="rate-currency"
            value={form.currency_code}
            onChange={(event) => setForm({ ...form, currency_code: event.target.value })}
            disabled={Boolean(editingId)}
            required
          >
            <option value="">Select a currency…</option>
            {availableCurrencyOptions.map((code) => (
              <option key={code} value={code}>
                {currencyLabel(code)}
              </option>
            ))}
          </select>
          <label htmlFor="rate-to-hkd">Rate to HKD</label>
          <input
            id="rate-to-hkd"
            type="number"
            step="0.000001"
            min="0"
            value={form.rate_to_hkd}
            onChange={(event) => setForm({ ...form, rate_to_hkd: event.target.value })}
            required
          />
          <label htmlFor="rate-to-usd">Rate to USD</label>
          <input
            id="rate-to-usd"
            type="number"
            step="0.000001"
            min="0"
            value={form.rate_to_usd}
            onChange={(event) => setForm({ ...form, rate_to_usd: event.target.value })}
            required
          />
          {saveError && <p role="alert">{saveError}</p>}
          <button type="submit" disabled={isSaving}>
            {isSaving ? "Saving…" : editingId ? "Update rate" : "Add rate"}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit}>
              Cancel
            </button>
          )}
        </form>
      )}

      <h2>Rates in use</h2>
      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}
      {!isLoading && !loadError && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Currency</th>
              <th>Rate to HKD</th>
              <th>Rate to USD</th>
              <th>Last updated</th>
              {canManage && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rates.map((rate) => (
              <tr key={rate.id}>
                <td>{currencyLabel(rate.currency_code)}</td>
                <td>{rate.rate_to_hkd}</td>
                <td>{rate.rate_to_usd}</td>
                <td>{new Date(rate.updated_at).toLocaleString()}</td>
                {canManage && (
                  <td>
                    <button type="button" onClick={() => startEdit(rate)}>
                      Edit
                    </button>
                    <button type="button" onClick={() => handleDelete(rate)}>
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
