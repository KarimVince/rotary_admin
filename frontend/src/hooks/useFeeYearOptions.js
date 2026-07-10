import { useEffect, useState } from "react";
import { listFeeSettings } from "../api/feeSettings";
import { currentRotaryYear } from "../utils/rotaryYear";

// Shared across all fee sub-pages (Fee run, Fee tracking, Fee statistics) so
// the rotary year selector always reflects the years actually configured in
// Fee settings, instead of a hardcoded current/current-1 pair.
export function useFeeYearOptions() {
  const [existingYears, setExistingYears] = useState([]);
  const [isLoadingYears, setIsLoadingYears] = useState(true);

  useEffect(() => {
    listFeeSettings()
      .then((data) => setExistingYears(data.map((row) => row.rotary_year)))
      .catch(() => {
        // Non-fatal — the selector still works with just the current year.
      })
      .finally(() => setIsLoadingYears(false));
  }, []);

  const yearOptions = Array.from(
    new Set([currentRotaryYear(), currentRotaryYear() - 1, ...existingYears]),
  ).sort((a, b) => b - a);

  return { yearOptions, existingYears, isLoadingYears };
}
