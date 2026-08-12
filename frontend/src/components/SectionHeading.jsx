// Section header + table wrapper used by the Finance pages and Event
// Manage-Project panels.
export function SectionHeading({ children }) {
  return <h2 className="seclabel">{children}</h2>;
}

export function TableWrap({ children }) {
  return <div className="fin-block">{children}</div>;
}
