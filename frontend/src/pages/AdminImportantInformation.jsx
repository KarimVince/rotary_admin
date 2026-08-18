import { useEffect, useMemo, useState } from "react";
import {
  createImportantInformation,
  deactivateImportantInformation,
  deleteImportantInformation,
  listImportantInformation,
  reactivateImportantInformation,
} from "../api/importantInformation";
import Card from "../components/Card";
import { useAccess } from "../hooks/useAccess";

const TITLE_MAX_LENGTH = 150;
const TEXT_MAX_LENGTH = 2000;

function formatDateTime(isoString) {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// New story — Admin page managing the Dashboard's Important Information
// banner. Only Write-access users can even see this page (the story's own
// AC: "others cannot access the admin management page") — unlike most
// self-gating pages in this app, there's no separate read-only view here.
export default function AdminImportantInformation() {
  const { canRead, canWrite } = useAccess("admin.important_information");

  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const [busyId, setBusyId] = useState(null);
  const [rowError, setRowError] = useState(null);

  async function loadMessages() {
    setIsLoading(true);
    setLoadError(null);
    try {
      setMessages(await listImportantInformation());
    } catch (err) {
      setLoadError(err.detail || "Failed to load messages");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead]);

  const activeMessage = useMemo(
    () => messages.find((message) => message.status === "active") ?? null,
    [messages],
  );
  const archivedMessages = useMemo(
    () => messages.filter((message) => message.status === "archived"),
    [messages],
  );

  async function handleCreate(event) {
    event.preventDefault();
    if (!title.trim() || !text.trim()) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await createImportantInformation(title.trim(), text.trim());
      setTitle("");
      setText("");
      await loadMessages();
    } catch (err) {
      setSaveError(err.detail || "Failed to save the message");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReactivate(id) {
    setBusyId(id);
    setRowError(null);
    try {
      await reactivateImportantInformation(id);
      await loadMessages();
    } catch (err) {
      setRowError(err.detail || "Failed to reactivate the message");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeactivate(id) {
    if (!window.confirm("Deactivate this message? It will stop showing on the Dashboard.")) return;
    setBusyId(id);
    setRowError(null);
    try {
      await deactivateImportantInformation(id);
      await loadMessages();
    } catch (err) {
      setRowError(err.detail || "Failed to deactivate the message");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Permanently delete this archived message?")) return;
    setBusyId(id);
    setRowError(null);
    try {
      await deleteImportantInformation(id);
      await loadMessages();
    } catch (err) {
      setRowError(err.detail || "Failed to delete the message");
    } finally {
      setBusyId(null);
    }
  }

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>Important Information</h1>
        <p role="alert">You do not have permission to view Important Information.</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <h1>Important Information</h1>
      <p className="mt-1 mb-5 text-sm text-[var(--color-muted-text)]">
        Manage the banner shown at the top of the Dashboard, above Club Overview. Only one
        message can be active at a time — saving a new one archives whatever was active.
      </p>

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && (
        <>
          <Card variant="default" className="!p-6 !rounded-2xl max-w-[640px] mb-5">
            <h2 className="mt-0 mb-3 text-sm font-bold uppercase tracking-[.06em] text-[var(--faint)]">
              Active message
            </h2>
            {activeMessage ? (
              <div className="rounded-xl bg-[var(--tone-amber-bg)] px-4 py-3.5 text-[var(--color-tone-amber-text)]">
                {/* Same real bug as Dashboard.jsx's banner: `mt-2`/`mb-2` on
                    <p> elements do nothing (index.css's unlayered
                    `p { margin: 0; }` always beats Tailwind's layered
                    utilities) — `gap-2` on this flex column sidesteps it. */}
                <div className="flex flex-col gap-2">
                  <p className="m-0 pb-2 border-b border-current/20 text-sm font-bold">
                    {activeMessage.title}
                  </p>
                  <p className="m-0 text-sm whitespace-pre-wrap">{activeMessage.text}</p>
                  <p className="m-0 text-[11px] opacity-80">
                    Set by {activeMessage.created_by_name || "—"} ·{" "}
                    {formatDateTime(activeMessage.created_at)}
                  </p>
                </div>
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => handleDeactivate(activeMessage.id)}
                    disabled={busyId === activeMessage.id}
                    className="mt-3 rounded-[8px] bg-[var(--tone-rose-bg)] px-3 py-[6px] text-[12px] font-semibold text-[#b23b3b] disabled:opacity-50"
                  >
                    Deactivate
                  </button>
                )}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-muted-text)]">No active message.</p>
            )}
          </Card>

          {canWrite && (
            <Card variant="default" className="!p-6 !rounded-2xl max-w-[640px] mb-5">
              <h2 className="mt-0 mb-3 text-sm font-bold uppercase tracking-[.06em] text-[var(--faint)]">
                New message
              </h2>
              <form onSubmit={handleCreate} className="flex flex-col gap-3">
                <label htmlFor="important-info-title" className="text-[12px] font-semibold">
                  Title
                </label>
                <input
                  id="important-info-title"
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={TITLE_MAX_LENGTH}
                  required
                  className="rounded-[8px] border border-[var(--color-border-faint)] p-2 text-[13px]"
                />
                <label htmlFor="important-info-text" className="text-[12px] font-semibold">
                  Text
                </label>
                <textarea
                  id="important-info-text"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  maxLength={TEXT_MAX_LENGTH}
                  rows={5}
                  required
                  className="rounded-[8px] border border-[var(--color-border-faint)] p-2 text-[13px]"
                />
                {saveError && <p role="alert">{saveError}</p>}
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-fit rounded-[9px] bg-[var(--color-brand-blue)] px-[14px] py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                >
                  {isSaving ? "Saving…" : "Save & activate"}
                </button>
              </form>
            </Card>
          )}

          <Card variant="default" className="!p-6 !rounded-2xl max-w-[640px]">
            <h2 className="mt-0 mb-3 text-sm font-bold uppercase tracking-[.06em] text-[var(--faint)]">
              History
            </h2>
            {rowError && <p role="alert">{rowError}</p>}
            {archivedMessages.length === 0 ? (
              <p className="text-sm text-[var(--color-muted-text)]">No archived messages yet.</p>
            ) : (
              <ul className="flex list-none flex-col gap-2 p-0 m-0">
                {archivedMessages.map((message) => (
                  <li
                    key={message.id}
                    className="rounded-[10px] border border-[var(--color-border-faint)] p-3"
                  >
                    {/* Same fix as the active-message card above — gap-2 on
                        a flex column instead of <p> margin utilities. */}
                    <div className="flex flex-col gap-2">
                      <p className="m-0 pb-2 border-b border-[var(--color-border-faint)] text-sm font-semibold text-[var(--text-h)]">
                        {message.title}
                      </p>
                      <p className="m-0 text-[13px] text-[var(--text)] whitespace-pre-wrap">
                        {message.text}
                      </p>
                      <p className="m-0 text-[11px] text-[var(--color-muted-text)]">
                        Archived {formatDateTime(message.archived_at)}
                      </p>
                    </div>
                    {canWrite && (
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleReactivate(message.id)}
                          disabled={busyId === message.id}
                          className="rounded-[8px] bg-[var(--color-brand-blue)] px-3 py-[6px] text-[12px] font-semibold text-white disabled:opacity-50"
                        >
                          Reactivate
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(message.id)}
                          disabled={busyId === message.id}
                          className="rounded-[8px] bg-[var(--tone-rose-bg)] px-3 py-[6px] text-[12px] font-semibold text-[#b23b3b] disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
