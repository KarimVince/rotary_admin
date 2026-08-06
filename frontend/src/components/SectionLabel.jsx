import { useTheme } from "../context/ThemeContext";

// Small uppercase eyebrow label + divider rule used above card grids and
// lists throughout the redesign (Dashboard sections, email compose pages'
// log section, ...). Minimal reuses the same ".seclabel" look as the
// Finance pages' SectionHeading (theme-minimal.css) instead of the
// classic flex+divider layout.
export default function SectionLabel({ children, action, className = "" }) {
  const { isMinimal } = useTheme();
  if (isMinimal) {
    return <div className="seclabel">{children}</div>;
  }
  return (
    <div className={`flex items-center gap-2 ${className}`.trim()}>
      <span className="text-xs font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
        {children}
      </span>
      <div className="flex-1 h-px bg-[var(--color-card-border)]" />
      {action}
    </div>
  );
}
