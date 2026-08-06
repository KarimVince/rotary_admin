import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// "Minimal" design theme's single-select variant of the same `.dd` widget
// as MultiSelectDropdown (prototype's yearField()/sel('Format', …)) — a
// radio-style option list that closes the menu as soon as a pick is made,
// unlike the multi-select's "stay open for more picks" behavior.
export default function SingleSelectDropdown({
  icon: Icon,
  value,
  options,
  onSelect,
  disabled = false,
  ariaLabel,
  minWidthClass = "min-w-[110px]",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    function handlePointerDown(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const selectedOption = options.find((option) => option.value === value);

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        className={`inline-flex h-[38px] items-center gap-2 rounded-[8px] border !bg-[var(--surface)] px-3 text-[13.5px] font-semibold text-[var(--ink)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${minWidthClass} ${
          isOpen
            ? "border-[var(--accent)] shadow-[0_0_0_3px_var(--accent-soft)]"
            : "border-[var(--border)] hover:border-[#d3d9e2]"
        }`}
      >
        {Icon && <Icon className="w-[15px] h-[15px] text-[var(--muted)]" aria-hidden="true" />}
        <span className="flex-1 text-left">{selectedOption?.label ?? value}</span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-[var(--muted)] transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className="absolute top-[calc(100%+6px)] left-0 z-20 min-w-full whitespace-nowrap rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-[0_12px_30px_-10px_rgba(20,27,43,.22)]"
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onSelect(option.value);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center rounded-[7px] !bg-transparent px-[11px] py-[9px] text-left text-[13.5px] ${
                  selected
                    ? "font-semibold text-[var(--accent-ink)]"
                    : "font-medium text-[var(--ink-2)] hover:!bg-[var(--bg-alt)]"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
