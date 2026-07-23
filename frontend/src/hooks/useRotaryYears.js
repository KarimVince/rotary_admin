import { useEffect, useRef, useState } from "react";
import { listRotaryYears } from "../api/rotaryYears";
import { currentRotaryYear } from "../utils/rotaryYear";

// Story 16.28 — the single source of every rotary-year selector/filter in
// the app. Replaces each page's own hardcoded year list (and the old
// useFeeYearOptions.js) with the central Admin Setup "Rotary Years" table.
//
// Also owns the page's "selected year" state (`selectedYear`/
// `setSelectedYear`) so every consumer gets the same bootstrap-then-correct
// default for free: paints instantly with the pure-date-math fallback,
// then corrects itself once to whatever year is actually flagged
// `is_current` in the table (a no-op in the common case where they agree).
// Once the caller changes the selection, this hook never overrides it again.
export function useRotaryYears() {
  const [years, setYears] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selectedYear, setSelectedYear] = useState(() => currentRotaryYear());
  const hasAppliedDefault = useRef(false);

  useEffect(() => {
    listRotaryYears()
      .then(setYears)
      .catch((err) => setLoadError(err.detail || "Failed to load rotary years"))
      .finally(() => setIsLoading(false));
  }, []);

  const yearOptions = years.map((row) => row.year).sort((a, b) => b - a);
  const currentRow = years.find((row) => row.is_current);
  // Falls back to pure date math if the table is empty or nothing is
  // flagged current — same formula the table itself is seeded from.
  const currentYear = currentRow ? currentRow.year : currentRotaryYear();

  useEffect(() => {
    if (!isLoading && !hasAppliedDefault.current) {
      hasAppliedDefault.current = true;
      setSelectedYear(currentYear);
    }
  }, [isLoading, currentYear]);

  return {
    years,
    yearOptions,
    currentYear,
    selectedYear,
    setSelectedYear,
    isLoading,
    loadError,
  };
}
