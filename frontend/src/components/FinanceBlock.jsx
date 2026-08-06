// "Minimal" design theme's compact label/value block layout for the Finance
// pages (see design_handoff_minimal_restyle/README.md — "Finance pages").
// Only rendered from each Finance page's isMinimal branch; styling lives in
// src/theme-minimal.css (.fin-* classes).
export function FinanceBlock({ title, total, children }) {
  return (
    <div className="fin-block">
      <div className="fin-blockhead">
        <span className="fin-mm">{title}</span>
        {total !== undefined && <span className="fin-rt">{total}</span>}
      </div>
      {children}
    </div>
  );
}

export function FinanceRow({ label, value, isTotal = false }) {
  return (
    <div className={`fin-frow${isTotal ? " fin-total" : ""}`}>
      <span className="fin-fl">{label}</span>
      <span className="fin-fv">{value}</span>
    </div>
  );
}
