import { useEffect, useState } from "react";
import {
  createFeeSettings,
  getFeeSettings,
  listFeeSettings,
  updateFeeSettings,
} from "../api/feeSettings";
import { CURRENCIES, currencyLabel } from "../data/currencies";
import { currentRotaryYear, rotaryYearLabel } from "../utils/rotaryYear";
import { useAccess } from "../hooks/useAccess";

const EMPTY_FORM = {
  early_bird_single_price: "",
  early_bird_couple_price: "",
  full_single_price: "",
  full_couple_price: "",
  currency: "HKD",
};

export default function FeeSettingsManagement() {
  const { canRead } = useAccess("fees.settings");
  const { canWrite: canManage } = useAccess("fees.settings");

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
      // Non-fatal — the year selector still works for a fresh year.
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
    new Set([currentRotaryYear(), currentRotaryYear() - 1, ...existingYears, ...addedYears]),
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
    return (
      <div className="admin-page">
        <h1>Fee settings</h1>
        <p role="alert">You do not have permission to view fee settings.</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <h1>Fee settings</h1>
      <p className="admin-page-note">
        Set the 4 annual prices for a rotary year. Early-bird vs full price is always chosen
        manually when a fee run is triggered — it is never based on a deadline.
      </p>

      <div className="fee-controls-row">
        <div>
          <label htmlFor="fee-settings-year" className="fee-year-label">
            Rotary year
          </label>
          <select
            id="fee-settings-year"
            className="fee-year-select"
            value={selectedYear}
            onChange={(event) => setSelectedYear(Number(event.target.value))}
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {rotaryYearLabel(year)}
                {existingYears.includes(year) ? "" : " (not set)"}
              </option>
            ))}
          </select>
        </div>

        {canManage && (
          <div>
            <label htmlFor="fee-settings-add-year">Add a year to this list</label>
            <form className="fee-add-year-form" onSubmit={handleAddYear}>
              <input
                id="fee-settings-add-year"
                type="number"
                step="1"
                placeholder={rotaryYearLabel(currentRotaryYear() + 1)}
                title="Enter the starting year only, e.g. 2027 for 2027–2028"
                value={newYearInput}
                onChange={(event) => setNewYearInput(event.target.value)}
              />
              {Number.isInteger(Number(newYearInput)) && newYearInput.trim() !== "" && (
                <span className="fee-add-year-preview">
                  → {rotaryYearLabel(Number(newYearInput))}
                </span>
              )}
              <button type="submit">Add year</button>
            </form>
            {addYearError && <span role="alert">{addYearError}</span>}
          </div>
        )}
      </div>

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && (
        <form className="admin-form" onSubmit={handleSubmit}>
          <h2>
            {existsForYear ? "Edit" : "Set"} prices — {rotaryYearLabel(selectedYear)}
          </h2>

          <label htmlFor="fee-early-single">Early Bird — Single</label>
          <input
            id="fee-early-single"
            type="number"
            step="0.01"
            min="0.01"
            value={form.early_bird_single_price}
            onChange={(event) =>
              setForm({ ...form, early_bird_single_price: event.target.value })
            }
            required
            disabled={!canManage}
          />

          <label htmlFor="fee-early-couple">Early Bird — Couple</label>
          <input
            id="fee-early-couple"
            type="number"
            step="0.01"
            min="0.01"
            value={form.early_bird_couple_price}
            onChange={(event) =>
              setForm({ ...form, early_bird_couple_price: event.target.value })
            }
            required
            disabled={!canManage}
          />

          <label htmlFor="fee-full-single">Full — Single</label>
          <input
            id="fee-full-single"
            type="number"
            step="0.01"
            min="0.01"
            value={form.full_single_price}
            onChange={(event) => setForm({ ...form, full_single_price: event.target.value })}
            required
            disabled={!canManage}
          />

          <label htmlFor="fee-full-couple">Full — Couple</label>
          <input
            id="fee-full-couple"
            type="number"
            step="0.01"
            min="0.01"
            value={form.full_couple_price}
            onChange={(event) => setForm({ ...form, full_couple_price: event.target.value })}
            required
            disabled={!canManage}
          />

          <label htmlFor="fee-currency">Currency</label>
          <select
            id="fee-currency"
            value={form.currency}
            onChange={(event) => setForm({ ...form, currency: event.target.value })}
            disabled={!canManage}
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {currencyLabel(code)}
              </option>
            ))}
          </select>

          {saveError && <p role="alert">{saveError}</p>}
          {saveSuccess && <p role="status">Fee settings saved.</p>}
          {canManage && (
            <button type="submit" disabled={isSaving}>
              {isSaving ? "Saving…" : existsForYear ? "Update prices" : "Save prices"}
            </button>
          )}
        </form>
      )}
    </div>
  );
}
