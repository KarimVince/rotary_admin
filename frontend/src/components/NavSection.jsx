import { ChevronDown } from "lucide-react";
import { NavLink } from "react-router-dom";

export default function NavSection({ icon: Icon, label, items, isOpen, onToggle, onNavigate }) {
  return (
    <div data-nav-section={label}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-semibold bg-transparent text-white/85 [&>svg:first-child]:text-white/55 hover:bg-white/10 transition-colors"
      >
        {Icon && <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />}
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 transition-transform duration-200 text-white/70 ${
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
          <div className="flex flex-col gap-1 pl-3 pr-0 pt-1 pb-1">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `no-underline px-3.5 py-2 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-[var(--menu-active)] text-[var(--menu-active-ink)] font-semibold"
                      : "text-white/60 hover:bg-white/10 hover:text-white"
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
