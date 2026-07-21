// Small uppercase eyebrow label + divider rule used above card grids and
// lists throughout the redesign (Dashboard sections, email compose pages'
// log section, ...).
export default function SectionLabel({ children, action, className = "" }) {
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
