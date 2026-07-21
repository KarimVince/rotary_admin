import Card from "./Card";
import SectionLabel from "./SectionLabel";

const STATUS_STYLES = {
  sent: { bgClass: "bg-[var(--tone-teal-bg)]", textClass: "text-[var(--color-tone-teal-text)]", label: "Sent" },
  partial_failure: {
    bgClass: "bg-[var(--tone-amber-bg)]",
    textClass: "text-[var(--color-tone-amber-text)]",
    label: "Partial failure",
  },
  failed: { bgClass: "bg-[var(--tone-rose-bg)]", textClass: "text-[var(--color-tone-rose-text)]", label: "Failed" },
  no_recipients: {
    bgClass: "bg-[var(--color-border-light)]",
    textClass: "text-[var(--color-muted-text)]",
    label: "No recipients",
  },
};

function StatusChip({ status }) {
  const style = STATUS_STYLES[status] ?? {
    bgClass: "bg-[var(--color-border-light)]",
    textClass: "text-[var(--color-muted-text)]",
    label: status,
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold ${style.bgClass} ${style.textClass}`}>
      {style.label}
    </span>
  );
}

function recipientGroupLabel(value) {
  if (value === "custom_selection") return "Custom selection";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// Shared "send history" table for the message-compose pages (member email,
// friend email, ...), styled like EventList.jsx's PastEventsTable — a
// Card-wrapped table with an uppercase muted header row instead of the
// generic admin-table used elsewhere.
export default function EmailLogTable({ entries }) {
  return (
    <>
      <SectionLabel className="mt-8">Email log</SectionLabel>
      <Card variant="default" className="!p-0 !rounded-2xl mt-3 overflow-hidden max-w-[900px]">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--color-border-faint)]">
              {["Subject", "Recipient group", "Recipients", "Status", "Attachments", "Sent at"].map((label) => (
                <th
                  key={label}
                  className="px-5 py-3 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-sm text-[var(--color-muted-text)]">
                  No emails sent yet.
                </td>
              </tr>
            )}
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b border-[var(--color-border-light)] last:border-b-0">
                <td className="px-5 py-[14px] text-[14px] font-semibold text-[#0c2340]">{entry.subject}</td>
                <td className="px-5 py-[14px] text-[14px] text-[var(--color-muted-text)]">
                  {recipientGroupLabel(entry.recipient_group)}
                </td>
                <td className="px-5 py-[14px] text-[14px] text-[var(--color-muted-text)]">
                  {entry.recipient_count}
                </td>
                <td className="px-5 py-[14px]">
                  <StatusChip status={entry.status} />
                </td>
                <td className="px-5 py-[14px] text-[14px] text-[var(--color-muted-text)]">
                  {entry.has_attachments ? "Yes" : "—"}
                </td>
                <td className="px-5 py-[14px] text-[14px] text-[var(--color-muted-text)]">
                  {new Date(entry.sent_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
