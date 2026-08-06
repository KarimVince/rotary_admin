import { Calendar } from "lucide-react";
import SingleSelectDropdown from "./SingleSelectDropdown";
import { rotaryYearLabel } from "../utils/rotaryYear";

// "Minimal" design theme's Rotary Year selector (matches the prototype's
// yearField() — a labelled dropdown with a calendar glyph), shared by every
// Finance page's isMinimal branch instead of each page's own plain <select>.
export default function RotaryYearField({
  year,
  yearOptions,
  currentYear,
  onChange,
  label = "Rotary year",
  className = "",
}) {
  return (
    <div className={`mb-4 flex flex-col gap-1.5 ${className}`.trim()}>
      <span className="pl-0.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]">
        {label}
      </span>
      <SingleSelectDropdown
        icon={Calendar}
        ariaLabel={label}
        minWidthClass="min-w-[150px]"
        value={String(year)}
        options={yearOptions.map((y) => ({
          value: String(y),
          label: `${rotaryYearLabel(y)}${y === currentYear ? " (current)" : ""}`,
        }))}
        onSelect={(value) => onChange(Number(value))}
      />
    </div>
  );
}
