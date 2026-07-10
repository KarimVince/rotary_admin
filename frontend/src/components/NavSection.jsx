import { ChevronDown } from "lucide-react";
import { NavLink } from "react-router-dom";

export default function NavSection({ icon: Icon, label, items, isOpen, onToggle, onNavigate }) {
  return (
    <div data-nav-section={label}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-semibold bg-[var(--color-brand-blue-chip-strong)] text-[var(--color-brand-blue-dark)] hover:brightness-95 transition-colors"
      >
        {Icon && <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />}
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>
      {/* CSS Grid 0fr/1fr trick: transitions smoothly without JS height
          measurement and naturally adapts to each section's item count. */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          {/* Redesign: sub-items are the SAME chip treatment as the parent
              row (solid light-blue pill at rest, solid dark-blue + white
              when active) instead of bare text links that only show a
              background on hover/active. */}
          <div className="flex flex-col gap-1 pl-3 pr-0 pt-1 pb-1">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `no-underline px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors ${
                    isActive
                      ? "bg-[var(--color-brand-blue)] text-white"
                      : "bg-[var(--color-brand-blue-chip)] text-[var(--color-brand-blue-dark)] hover:brightness-95"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
