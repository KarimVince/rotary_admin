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
// Story 16.24 (revised): the earlier pass gave only the Subject <th> a
// width (`w-full`) under `table-fixed` — with no width on the other
// columns, the fixed layout algorithm has nothing to size them against, so
// they collapsed/overlapped instead of sitting in their own space. A
// <colgroup> now gives every column an explicit width up front — Subject
// gets the rest via `width: auto` and is the only one that can truncate;
// every other column has a fixed px width sized to its content plus
// `whitespace-nowrap`, so nothing wraps or overlaps regardless of how long
// the subject is. The page itself must also opt into the wide (1400px)
// `.admin-page-wide` layout (see MembersEmail.jsx/RotaryFriendsEmail.jsx) —
// otherwise this `w-full` table is still just 100% of a 900px-capped page.
const COLUMN_WIDTHS = [null, 130, 90, 130, 100, 170];

export default function EmailLogTable({ entries }) {
  return (
    <>
      <SectionLabel className="mt-8">Email log</SectionLabel>
      <Card variant="default" className="!p-0 !rounded-2xl mt-3 overflow-hidden overflow-x-auto w-full">
        <table className="w-full border-collapse text-left table-fixed">
          <colgroup>
            {COLUMN_WIDTHS.map((width, index) => (
              <col key={index} style={width ? { width } : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-[var(--color-border-faint)]">
              <th className="px-4 py-2 text-[11px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]">
                Subject
              </th>
              {["Recipient group", "Recipients", "Status", "Attachments", "Sent at"].map((label) => (
                <th
                  key={label}
                  className="whitespace-nowrap px-4 py-2 text-[11px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-[13px] text-[var(--color-muted-text)]">
                  No emails sent yet.
                </td>
              </tr>
            )}
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b border-[var(--color-border-light)] last:border-b-0">
                <td
                  title={entry.subject}
                  className="max-w-0 truncate px-4 py-2 text-[13px] font-semibold text-[#0c2340]"
                >
                  {entry.subject}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-[13px] text-[var(--color-muted-text)]">
                  {recipientGroupLabel(entry.recipient_group)}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-[13px] text-[var(--color-muted-text)]">
                  {entry.recipient_count}
                </td>
                <td className="whitespace-nowrap px-4 py-2">
                  <StatusChip status={entry.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-[13px] text-[var(--color-muted-text)]">
                  {entry.has_attachments ? "Yes" : "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-[13px] text-[var(--color-muted-text)]">
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
