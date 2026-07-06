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
import { useAuth } from "../hooks/useAuth";
import { splitTags } from "../utils/tags";

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
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

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
    loadFriends();
  }, []);

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

  return (
    <div className="admin-page">
      <div className="page-header-row">
        <h1>Friends of Rotary</h1>
        {isAdmin && (
          <div className="page-header-actions">
            <button type="button" onClick={handleExport} disabled={isExporting}>
              {isExporting ? "Exporting…" : "Export CSV"}
            </button>
            <button type="button" onClick={openImportModal}>
              Import CSV
            </button>
            <button type="button" className="btn-add-member" onClick={openAddModal}>
              + Add Friend
            </button>
          </div>
        )}
      </div>
      {exportError && <p role="alert">{exportError}</p>}

      {isImportModalOpen && isAdmin && (
        <div className="modal-overlay" onClick={closeImportModal}>
          <div className="modal-dialog" onClick={(event) => event.stopPropagation()}>
            <h2>Import friends from CSV</h2>
            <p>
              Columns: <code>name, email, whatsapp, tags, source, notes</code>. Duplicate
              emails and validation errors are flagged below before anything is imported.
            </p>

            <input
              type="file"
              accept=".csv,text/csv"
              aria-label="CSV file"
              onChange={handleFileSelected}
              disabled={isPreviewing}
            />
            {isPreviewing && <p>Parsing…</p>}
            {importError && <p role="alert">{importError}</p>}

            {commitResult && (
              <p>
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
                <p>
                  {previewResult.valid_count} valid, {previewResult.error_count} with errors,{" "}
                  {previewResult.duplicate_count} duplicate
                  {previewResult.duplicate_count === 1 ? "" : "s"} (of {previewResult.rows.length}{" "}
                  row{previewResult.rows.length === 1 ? "" : "s"}).
                </p>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>WhatsApp</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewResult.rows.map((row) => (
                      <tr key={row.row_number}>
                        <td>{row.row_number}</td>
                        <td>
                          {row.first_name} {row.last_name}
                        </td>
                        <td>{row.email ?? "—"}</td>
                        <td>{row.whatsapp ?? "—"}</td>
                        <td>
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
                <button
                  type="button"
                  onClick={handleCommitImport}
                  disabled={isCommitting || previewResult.valid_count === 0}
                >
                  {isCommitting
                    ? "Importing…"
                    : `Import ${previewResult.valid_count} friend${
                        previewResult.valid_count === 1 ? "" : "s"
                      }`}
                </button>
              </>
            )}

            <div className="modal-actions">
              <button type="button" onClick={closeImportModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && isAdmin && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-dialog" onClick={(event) => event.stopPropagation()}>
            <form onSubmit={handleSubmit}>
              <h2>{editingId ? "Edit friend" : "Add friend"}</h2>

              <div className="member-form-grid">
                <div>
                  <label htmlFor="friend-first-name">First name</label>
                  <input
                    id="friend-first-name"
                    type="text"
                    value={form.first_name}
                    onChange={(event) => setForm({ ...form, first_name: event.target.value })}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="friend-last-name">Last name</label>
                  <input
                    id="friend-last-name"
                    type="text"
                    value={form.last_name}
                    onChange={(event) => setForm({ ...form, last_name: event.target.value })}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="friend-email">Email</label>
                  <input
                    id="friend-email"
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="friend-whatsapp">WhatsApp</label>
                  <input
                    id="friend-whatsapp"
                    type="text"
                    placeholder="+33612345678"
                    value={form.whatsapp}
                    onChange={(event) => setForm({ ...form, whatsapp: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="friend-tags">Tags</label>
                  <input
                    id="friend-tags"
                    type="text"
                    placeholder="donor, alumni"
                    value={form.tags}
                    onChange={(event) => setForm({ ...form, tags: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="friend-source">Source</label>
                  <input
                    id="friend-source"
                    type="text"
                    placeholder="How we met them"
                    value={form.source}
                    onChange={(event) => setForm({ ...form, source: event.target.value })}
                  />
                </div>
                <div className="field-full">
                  <label htmlFor="friend-notes">Notes</label>
                  <input
                    id="friend-notes"
                    type="text"
                    value={form.notes}
                    onChange={(event) => setForm({ ...form, notes: event.target.value })}
                  />
                </div>
              </div>

              {saveError && <p role="alert">{saveError}</p>}
              <div className="modal-actions">
                <button type="submit" disabled={isSaving}>
                  {isSaving ? "Saving…" : editingId ? "Update friend" : "Save friend"}
                </button>
                <button type="button" onClick={closeModal}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="member-filter-bar">
        <input
          id="filter-search"
          className="member-filter-search"
          type="text"
          placeholder="Search by name or email…"
          aria-label="Search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          id="filter-tag"
          aria-label="Tag"
          value={tagFilter}
          onChange={(event) => setTagFilter(event.target.value)}
        >
          <option value="">All tags</option>
          {tagOptions.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
        <select
          id="filter-source"
          aria-label="Source"
          value={sourceFilter}
          onChange={(event) => setSourceFilter(event.target.value)}
        >
          <option value="">All sources</option>
          {sourceOptions.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && visibleFriends.length === 0 && (
        <p className="member-empty-state">No friends match your search or filters.</p>
      )}

      {!isLoading && !loadError && visibleFriends.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>WhatsApp</th>
              <th>Tags</th>
              <th>Source</th>
              {isAdmin && <th aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {visibleFriends.map((friend) => (
              <tr key={friend.id} className="data-row">
                <td>
                  {friend.first_name} {friend.last_name}
                </td>
                <td>{friend.email ?? "—"}</td>
                <td>{friend.whatsapp ?? "—"}</td>
                <td>{friend.tags ?? "—"}</td>
                <td>{friend.source ?? "—"}</td>
                {isAdmin && (
                  <td>
                    <button type="button" onClick={() => startEdit(friend)}>
                      Edit
                    </button>
                    <button type="button" onClick={() => handleDelete(friend)}>
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
