import { useEffect, useMemo, useState } from "react";
import {
  commitRotaryFriendsImport,
  exportRotaryFriendsCsv,
  previewRotaryFriendsImport,
} from "../api/rotaryFriendImport";
import {
  createRotaryFriend,
  deleteRotaryFriend,
  listRotaryFriends,
  updateRotaryFriend,
} from "../api/rotaryFriends";
import Card from "../components/Card";
import { useAccess } from "../hooks/useAccess";
import { INPUT_CLASS, SELECT_CLASS } from "../styles/formControls";
import { splitTags } from "../utils/tags";

const PRIMARY_BUTTON_CLASS =
  "rounded-full px-6 py-2.5 text-[14.5px] font-semibold text-white bg-[var(--color-brand-blue)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";
const SECONDARY_BUTTON_CLASS =
  "rounded-full px-6 py-2.5 text-[14.5px] font-semibold text-[var(--color-muted-text-strong)] bg-[var(--color-border-light)] hover:bg-[var(--color-card-border)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";
const ROW_BUTTON_CLASS =
  "rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mr-2 border-none";
const OUTLINE_BUTTON_CLASS =
  "border border-[var(--color-brand-blue)] bg-white text-[var(--color-brand-blue)] rounded-lg px-4 py-2 text-[13.5px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap";

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  email: "",
  whatsapp: "",
  tags: "",
  source: "",
  notes: "",
};

function toPayload(form) {
  const payload = { ...form };
  Object.keys(payload).forEach((key) => {
    if (payload[key] === "") payload[key] = null;
  });
  return payload;
}

export default function RotaryFriendsList() {
  const { canRead, canWrite: isAdmin } = useAccess("friends.directory");

  const [friends, setFriends] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewResult, setPreviewResult] = useState(null);
  const [importError, setImportError] = useState(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

  async function loadFriends() {
    setIsLoading(true);
    try {
      const data = await listRotaryFriends();
      setFriends(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.detail || "Failed to load Rotary friends");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    loadFriends();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead]);

  const tagOptions = useMemo(
    () => [...new Set(friends.flatMap((friend) => splitTags(friend.tags)))].sort(),
    [friends],
  );

  const sourceOptions = useMemo(
    () => [...new Set(friends.map((friend) => friend.source).filter(Boolean))].sort(),
    [friends],
  );

  const visibleFriends = useMemo(() => {
    const term = search.trim().toLowerCase();
    return friends.filter((friend) => {
      if (tagFilter && !splitTags(friend.tags).includes(tagFilter)) return false;
      if (sourceFilter && friend.source !== sourceFilter) return false;
      if (!term) return true;
      const haystack = `${friend.first_name} ${friend.last_name} ${
        friend.email ?? ""
      }`.toLowerCase();
      return haystack.includes(term);
    });
  }, [friends, search, tagFilter, sourceFilter]);

  function openAddModal() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
    setIsModalOpen(true);
  }

  function startEdit(friend) {
    setEditingId(friend.id);
    setForm({
      first_name: friend.first_name ?? "",
      last_name: friend.last_name ?? "",
      email: friend.email ?? "",
      whatsapp: friend.whatsapp ?? "",
      tags: friend.tags ?? "",
      source: friend.source ?? "",
      notes: friend.notes ?? "",
    });
    setSaveError(null);
    setIsModalOpen(true);
  }

  function closeModal() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
    setIsModalOpen(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError(null);

    if (!form.email && !form.whatsapp) {
      setSaveError("Either email or WhatsApp is required");
      return;
    }

    setIsSaving(true);
    try {
      const payload = toPayload(form);
      if (editingId) {
        await updateRotaryFriend(editingId, payload);
      } else {
        await createRotaryFriend(payload);
      }
      closeModal();
      await loadFriends();
    } catch (err) {
      setSaveError(err.detail || "Failed to save Rotary friend");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(friend) {
    if (
      !window.confirm(`Remove ${friend.first_name} ${friend.last_name} from Rotary Friends?`)
    ) {
      return;
    }
    await deleteRotaryFriend(friend.id);
    await loadFriends();
  }

  function openImportModal() {
    setPreviewResult(null);
    setImportError(null);
    setCommitResult(null);
    setIsImportModalOpen(true);
  }

  function closeImportModal() {
    setIsImportModalOpen(false);
  }

  async function handleFileSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsPreviewing(true);
    setImportError(null);
    setPreviewResult(null);
    setCommitResult(null);
    try {
      const result = await previewRotaryFriendsImport(file);
      setPreviewResult(result);
    } catch (err) {
      setImportError(err.detail || "Failed to parse CSV file");
    } finally {
      setIsPreviewing(false);
      event.target.value = "";
    }
  }

  async function handleCommitImport() {
    if (!previewResult) return;
    const importableRows = previewResult.rows.filter(
      (row) => row.errors.length === 0 && !row.is_duplicate,
    );
    if (importableRows.length === 0) return;

    setIsCommitting(true);
    setImportError(null);
    try {
      const result = await commitRotaryFriendsImport(
        importableRows.map((row) => ({
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email,
          whatsapp: row.whatsapp,
          tags: row.tags,
          source: row.source,
          notes: row.notes,
        })),
      );
      setCommitResult(result);
      setPreviewResult(null);
      await loadFriends();
    } catch (err) {
      setImportError(err.detail || "Failed to import friends");
    } finally {
      setIsCommitting(false);
    }
  }

  async function handleExport() {
    setIsExporting(true);
    setExportError(null);
    try {
      const { blob, filename } = await exportRotaryFriendsCsv();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err.detail || "Failed to export friends");
    } finally {
      setIsExporting(false);
    }
  }

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>Friends of Rotary</h1>
        <p role="alert">You do not have permission to view Friends of Rotary.</p>
      </div>
    );
  }

  return (
    <div className="admin-page admin-page-wide">
      <div className="flex justify-between items-start gap-3 flex-wrap mb-1">
        <div>
          <h1 className="mb-1">Friends of Rotary</h1>
          <p className="text-sm text-[var(--color-muted-text)]">
            Contacts outside the club roster — donors, sponsors, and supporters kept for outreach.
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" className={OUTLINE_BUTTON_CLASS} onClick={handleExport} disabled={isExporting}>
              {isExporting ? "Exporting…" : "Export CSV"}
            </button>
            <button type="button" className={OUTLINE_BUTTON_CLASS} onClick={openImportModal}>
              Import CSV
            </button>
            <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={openAddModal}>
              + Add Friend
            </button>
          </div>
        )}
      </div>
      {exportError && <p role="alert">{exportError}</p>}

      {isImportModalOpen && isAdmin && (
        <div className="modal-overlay" onClick={closeImportModal}>
          <div
            className="modal-dialog !rounded-2xl !max-w-[640px] !text-[15px]"
            role="dialog"
            aria-label="Import friends from CSV"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-[19px] font-semibold text-[var(--color-brand-blue-dark)] mb-2">
              Import friends from CSV
            </h2>
            <p className="text-sm text-[var(--color-muted-text)] mb-4">
              Columns: <code>name, email, whatsapp, tags, source, notes</code>. Duplicate emails
              and validation errors are flagged below before anything is imported.
            </p>

            <input
              type="file"
              accept=".csv,text/csv"
              aria-label="CSV file"
              onChange={handleFileSelected}
              disabled={isPreviewing}
              className="text-sm mb-3"
            />
            {isPreviewing && <p className="text-sm text-[var(--color-muted-text)]">Parsing…</p>}
            {importError && <p role="alert">{importError}</p>}

            {commitResult && (
              <p role="status" className="text-sm text-[var(--color-muted-text)] mt-2">
                Imported {commitResult.created_count} friend
                {commitResult.created_count === 1 ? "" : "s"}
                {commitResult.skipped_count > 0
                  ? `; ${commitResult.skipped_count} skipped as duplicate`
                  : ""}
                .
              </p>
            )}

            {previewResult && (
              <>
                <p className="text-sm text-[var(--color-muted-text)] mt-2 mb-3">
                  {previewResult.valid_count} valid, {previewResult.error_count} with errors,{" "}
                  {previewResult.duplicate_count} duplicate
                  {previewResult.duplicate_count === 1 ? "" : "s"} (of {previewResult.rows.length}{" "}
                  row{previewResult.rows.length === 1 ? "" : "s"}).
                </p>
                <div className="max-h-[280px] overflow-y-auto border border-[var(--color-card-border)] rounded-xl mb-3">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-[var(--color-border-light)]">
                        <th className="text-left px-3 py-2 text-xs font-bold text-[var(--color-muted-text)] uppercase tracking-wide">Row</th>
                        <th className="text-left px-3 py-2 text-xs font-bold text-[var(--color-muted-text)] uppercase tracking-wide">Name</th>
                        <th className="text-left px-3 py-2 text-xs font-bold text-[var(--color-muted-text)] uppercase tracking-wide">Email</th>
                        <th className="text-left px-3 py-2 text-xs font-bold text-[var(--color-muted-text)] uppercase tracking-wide">WhatsApp</th>
                        <th className="text-left px-3 py-2 text-xs font-bold text-[var(--color-muted-text)] uppercase tracking-wide">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewResult.rows.map((row) => (
                        <tr key={row.row_number} className="border-t border-[var(--color-border-light)]">
                          <td className="px-3 py-2 text-sm text-[var(--color-muted-text)]">{row.row_number}</td>
                          <td className="px-3 py-2 text-sm">
                            {row.first_name} {row.last_name}
                          </td>
                          <td className="px-3 py-2 text-sm text-[var(--color-muted-text)]">{row.email ?? "—"}</td>
                          <td className="px-3 py-2 text-sm text-[var(--color-muted-text)]">{row.whatsapp ?? "—"}</td>
                          <td className="px-3 py-2 text-sm">
                            {row.errors.length > 0
                              ? row.errors.join("; ")
                              : row.is_duplicate
                                ? "Duplicate — skipped"
                                : "Valid"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  onClick={handleCommitImport}
                  disabled={isCommitting || previewResult.valid_count === 0}
                  className={PRIMARY_BUTTON_CLASS}
                >
                  {isCommitting
                    ? "Importing…"
                    : `Import ${previewResult.valid_count} friend${
                        previewResult.valid_count === 1 ? "" : "s"
                      }`}
                </button>
              </>
            )}

            <div className="flex justify-end mt-5">
              <button type="button" onClick={closeImportModal} className={SECONDARY_BUTTON_CLASS}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && isAdmin && (
        <div className="modal-overlay" onClick={closeModal}>
          <div
            className="modal-dialog !rounded-2xl !max-w-[560px] !text-[15px]"
            role="dialog"
            aria-label={editingId ? "Edit friend" : "Add friend"}
            onClick={(event) => event.stopPropagation()}
          >
            <form onSubmit={handleSubmit}>
              <h2 className="text-[19px] font-semibold text-[var(--color-brand-blue-dark)] mb-3">
                {editingId ? "Edit friend" : "Add friend"}
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="friend-first-name" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
                    First name
                  </label>
                  <input
                    id="friend-first-name"
                    type="text"
                    value={form.first_name}
                    onChange={(event) => setForm({ ...form, first_name: event.target.value })}
                    required
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="friend-last-name" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
                    Last name
                  </label>
                  <input
                    id="friend-last-name"
                    type="text"
                    value={form.last_name}
                    onChange={(event) => setForm({ ...form, last_name: event.target.value })}
                    required
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="friend-email" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
                    Email
                  </label>
                  <input
                    id="friend-email"
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="friend-whatsapp" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
                    WhatsApp
                  </label>
                  <input
                    id="friend-whatsapp"
                    type="text"
                    placeholder="+33612345678"
                    value={form.whatsapp}
                    onChange={(event) => setForm({ ...form, whatsapp: event.target.value })}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="friend-tags" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
                    Tags
                  </label>
                  <input
                    id="friend-tags"
                    type="text"
                    placeholder="donor, alumni"
                    value={form.tags}
                    onChange={(event) => setForm({ ...form, tags: event.target.value })}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="friend-source" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
                    Source
                  </label>
                  <input
                    id="friend-source"
                    type="text"
                    placeholder="How we met them"
                    value={form.source}
                    onChange={(event) => setForm({ ...form, source: event.target.value })}
                    className={INPUT_CLASS}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="friend-notes" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
                    Notes
                  </label>
                  <input
                    id="friend-notes"
                    type="text"
                    value={form.notes}
                    onChange={(event) => setForm({ ...form, notes: event.target.value })}
                    className={INPUT_CLASS}
                  />
                </div>
              </div>

              {saveError && <p role="alert">{saveError}</p>}
              <div className="flex gap-3 mt-5">
                <button type="submit" disabled={isSaving} className={PRIMARY_BUTTON_CLASS}>
                  {isSaving ? "Saving…" : editingId ? "Update friend" : "Save friend"}
                </button>
                <button type="button" onClick={closeModal} className={SECONDARY_BUTTON_CLASS}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex items-end gap-4 flex-wrap mb-5">
        <div className="flex-1 min-w-[220px]">
          <label htmlFor="filter-search" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
            Search
          </label>
          <input
            id="filter-search"
            type="text"
            placeholder="Search by name or email…"
            aria-label="Search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor="filter-tag" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
            Tag
          </label>
          <select
            id="filter-tag"
            aria-label="Tag"
            value={tagFilter}
            onChange={(event) => setTagFilter(event.target.value)}
            className={`${SELECT_CLASS} min-w-[150px]`}
          >
            <option value="">All tags</option>
            {tagOptions.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filter-source" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
            Source
          </label>
          <select
            id="filter-source"
            aria-label="Source"
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value)}
            className={`${SELECT_CLASS} min-w-[150px]`}
          >
            <option value="">All sources</option>
            {sourceOptions.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && visibleFriends.length === 0 && (
        <p className="text-sm text-[var(--color-muted-text)]">No friends match your search or filters.</p>
      )}

      {!isLoading && !loadError && visibleFriends.length > 0 && (
        <Card variant="default" className="!p-0 !rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-[var(--color-border-light)]">
                  <th className="text-left px-5 py-3 text-xs font-bold text-[var(--color-muted-text)] uppercase tracking-wide">Name</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-[var(--color-muted-text)] uppercase tracking-wide">Email</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-[var(--color-muted-text)] uppercase tracking-wide">WhatsApp</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-[var(--color-muted-text)] uppercase tracking-wide">Tags</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-[var(--color-muted-text)] uppercase tracking-wide">Source</th>
                  {isAdmin && <th className="px-5 py-3" aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {visibleFriends.map((friend) => (
                  <tr key={friend.id} className="border-t border-[var(--color-border-light)]">
                    <td className="px-5 py-3 text-sm font-semibold text-[#0c2340]">
                      {friend.first_name} {friend.last_name}
                    </td>
                    <td className="px-5 py-3 text-sm text-[var(--color-muted-text)]">{friend.email ?? "—"}</td>
                    <td className="px-5 py-3 text-sm text-[var(--color-muted-text)]">{friend.whatsapp ?? "—"}</td>
                    <td className="px-5 py-3 text-sm text-[var(--color-muted-text)]">{friend.tags ?? "—"}</td>
                    <td className="px-5 py-3 text-sm text-[var(--color-muted-text)]">{friend.source ?? "—"}</td>
                    {isAdmin && (
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => startEdit(friend)}
                          className={`${ROW_BUTTON_CLASS} text-[var(--color-brand-blue)] bg-white border border-[var(--color-brand-blue)]`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(friend)}
                          className={`${ROW_BUTTON_CLASS} text-[#b23b3b] bg-[var(--tone-rose-bg)]`}
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
