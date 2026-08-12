// Small uppercase eyebrow label + divider rule used above card grids and
// lists throughout the app (Dashboard sections, email compose pages' log
// section, ...). Reuses the ".seclabel" look shared with the Finance
// pages' SectionHeading (see theme-minimal.css).
export default function SectionLabel({ children }) {
  return <div className="seclabel">{children}</div>;
}
