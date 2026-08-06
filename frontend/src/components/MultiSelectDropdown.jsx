import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// "Minimal" design theme's dropdown widget (matches the prototype's `.dd`/
// `.dd-btn`/`.dd-menu`/`.dd-opt` markup) — a trigger button showing a
// computed label + chevron, opening a checkbox-style multi-select menu.
// Per the prototype: selecting an option keeps the menu open (so several
// can be picked in a row); it only closes on an outside click, Escape, or
// re-clicking the trigger.
export default function MultiSelectDropdown({
  icon: Icon,
  allLabel,
  options,
  selected,
  onToggleOption,
  onClear,
  disabled = false,
  ariaLabel,
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

  const triggerLabel =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? selected[0]
        : `${selected.length} types`;

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        className={`inline-flex h-[38px] min-w-[150px] items-center gap-2 rounded-[8px] border !bg-[var(--surface)] px-3 text-[13.5px] font-semibold text-[var(--ink)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          isOpen
            ? "border-[var(--accent)] shadow-[0_0_0_3px_var(--accent-soft)]"
            : "border-[var(--border)] hover:border-[#d3d9e2]"
        }`}
      >
        {Icon && <Icon className="w-[15px] h-[15px] text-[var(--muted)]" aria-hidden="true" />}
        <span className="flex-1 text-left">{triggerLabel}</span>
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
          aria-multiselectable="true"
          aria-label={ariaLabel}
          className="absolute top-[calc(100%+6px)] left-0 z-20 min-w-full whitespace-nowrap rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-[0_12px_30px_-10px_rgba(20,27,43,.22)]"
        >
          <DropdownOption selected={selected.length === 0} onClick={onClear}>
            {allLabel}
          </DropdownOption>
          {options.map((option) => (
            <DropdownOption
              key={option.value}
              selected={selected.includes(option.value)}
              onClick={() => onToggleOption(option.value)}
            >
              {option.label}
            </DropdownOption>
          ))}
        </div>
      )}
    </div>
  );
}

function DropdownOption({ selected, onClick, children }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-[7px] !bg-transparent px-[11px] py-[9px] text-left text-[13.5px] ${
        selected
          ? "font-semibold text-[var(--accent-ink)]"
          : "font-medium text-[var(--ink-2)] hover:!bg-[var(--bg-alt)]"
      }`}
    >
      <span
        className={`grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border-[1.5px] ${
          selected ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--border)]"
        }`}
      >
        {selected && <Check className="h-3 w-3 text-white" aria-hidden="true" />}
      </span>
      {children}
    </button>
  );
}
