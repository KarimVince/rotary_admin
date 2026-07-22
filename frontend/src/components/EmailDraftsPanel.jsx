import Card from "./Card";
import SectionLabel from "./SectionLabel";

// Story 16.19: shared "Drafts" list for the message-compose pages (member
// email, friend email) — same Card-table look as EmailLogTable, since a
// draft is really just a not-yet-sent sibling of a log entry.
export default function EmailDraftsPanel({ drafts, onEdit, onDelete }) {
  if (drafts.length === 0) return null;

  return (
    <>
      <SectionLabel className="mt-8">
        Drafts ({drafts.length})
      </SectionLabel>
      <Card variant="default" className="!p-0 !rounded-2xl mt-3 overflow-hidden max-w-[900px]">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--color-border-faint)]">
              {["Subject", "Recipients", "Last saved", ""].map((label) => (
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
            {drafts.map((draft) => {
              const recipientCount =
                (draft.member_ids?.length ?? 0) + (draft.friend_ids?.length ?? 0);
              return (
                <tr key={draft.id} className="border-b border-[var(--color-border-light)] last:border-b-0">
                  <td className="px-5 py-[14px] text-[14px] font-semibold text-[#0c2340]">
                    {draft.subject || "(no subject)"}
                  </td>
                  <td className="px-5 py-[14px] text-[14px] text-[var(--color-muted-text)]">
                    {draft.recipient_group ? draft.recipient_group : recipientCount}
                  </td>
                  <td className="px-5 py-[14px] text-[14px] text-[var(--color-muted-text)]">
                    {new Date(draft.updated_at).toLocaleString()}
                  </td>
                  <td className="px-5 py-[14px] text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onEdit(draft)}
                      className="bg-transparent border-none p-0 mr-4 text-[13px] font-semibold text-[var(--color-brand-blue)] cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(draft)}
                      className="bg-transparent border-none p-0 text-[13px] font-semibold text-[var(--color-tone-rose-text)] cursor-pointer"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
