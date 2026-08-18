// Small uppercase eyebrow label + divider rule used above card grids and
// lists throughout the app (Dashboard sections, email compose pages' log
// section, ...). Reuses the ".seclabel" look shared with the Finance
// pages' SectionHeading (see theme-minimal.css).
//
// `className` is deliberately NOT applied here — callers pass spacing
// utilities like "mt-6" out of habit (shared with a since-removed Classic
// theme), but `.seclabel`'s own `margin: 38px 0 15px` already supplies the
// real spacing under Minimal, and `.seclabel + *` zeroes the following
// grid's own margin-top to match — see the long comment in
// theme-minimal.css right above that rule (verified via computed-style
// diff against the reference design; applying className here doubles the
// gap). Do not "fix" this without re-reading that comment.
export default function SectionLabel({ children }) {
  return <div className="seclabel">{children}</div>;
}
