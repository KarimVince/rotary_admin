// Shared box styling for standalone "form" text inputs and selects (a
// labelled field on its own, not a dense table-row cell) — used across the
// Tailwind Card-redesigned pages so a <select> next to a text <input> looks
// like one consistent field style instead of the browser's native dropdown
// chrome. `.form-select` (frontend/src/App.css) supplies the custom chevron.
// Deliberately not used for dense inline table-row selects (e.g. a Tier or
// Channel select inside a data table row) — those keep their own compact
// `rounded-md px-2 py-1` style, matching the Permission Matrix/Admin table
// convention documented in App.css.
export const INPUT_CLASS =
  "w-full border border-[var(--color-card-border)] rounded-lg px-3 py-2 text-sm";

export const SELECT_CLASS = `${INPUT_CLASS} bg-white form-select`;
