import { Pencil, Trash2 } from "lucide-react";
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
                  <td className="px-5 py-[14px] text-[14px] font-semibold text-[var(--text-h)]">
                    {draft.subject || "(no subject)"}
                  </td>
                  <td className="px-5 py-[14px] text-[14px] text-[var(--color-muted-text)]">
                    {draft.recipient_group ? draft.recipient_group : recipientCount}
                  </td>
                  <td className="px-5 py-[14px] text-[14px] text-[var(--color-muted-text)]">
                    {new Date(draft.updated_at).toLocaleString()}
                  </td>
                  <td className="px-5 py-[14px] text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit(draft)}
                        title="Edit draft"
                        aria-label="Edit draft"
                        className="grid h-[30px] w-[30px] place-items-center rounded-[7px] !bg-transparent text-[var(--muted)] hover:!bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                      >
                        <Pencil className="w-4 h-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(draft)}
                        title="Delete draft"
                        aria-label="Delete draft"
                        className="grid h-[30px] w-[30px] place-items-center rounded-[7px] !bg-transparent text-[var(--muted)] hover:!bg-[var(--low-bg)] hover:text-[var(--low)]"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
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
