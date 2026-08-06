import Card from "./Card";

// Shared "Minimal" design theme section header + table wrapper, used by the
// Finance pages and Event Manage-Project panels' isMinimal branches (see
// design_handoff_minimal_restyle/README.md). Classic keeps the existing
// bold-accent <h2> / Card wrapper unchanged.
export function SectionHeading({ isMinimal, children, className = "" }) {
  return isMinimal ? (
    <h2 className="seclabel">{children}</h2>
  ) : (
    <h2 className={`text-[17px] font-bold text-[var(--color-brand-blue)] mb-3 ${className}`.trim()}>
      {children}
    </h2>
  );
}

export function TableWrap({ isMinimal, children }) {
  return isMinimal ? (
    <div className="fin-block">{children}</div>
  ) : (
    <Card variant="default" className="!p-0 !rounded-2xl overflow-hidden">
      {children}
    </Card>
  );
}
