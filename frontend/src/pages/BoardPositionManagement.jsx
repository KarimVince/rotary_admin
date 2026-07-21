import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  createBoardPosition,
  deactivateBoardPosition,
  deleteBoardPositionPermanently,
  getBoardPositionAssignmentCount,
  listBoardPositions,
  updateBoardPosition,
} from "../api/boardPositions";
import Card from "../components/Card";
import { useAccess } from "../hooks/useAccess";

const EMPTY_FORM = { name: "", display_order: 0, at_the_board: false };

const ALWAYS_AT_THE_BOARD = new Set(["president", "treasurer", "secretary"]);

function isLockedAtTheBoard(name) {
  return ALWAYS_AT_THE_BOARD.has(name.trim().toLowerCase());
}

export default function BoardPositionManagement() {
  const { canRead, canWrite } = useAccess("board.positions");
  const [positions, setPositions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  async function loadPositions() {
    setIsLoading(true);
    try {
      const data = await listBoardPositions({ includeInactive: true });
      setPositions(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.detail || "Failed to load board positions");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    loadPositions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead]);

  function startEdit(position) {
    setEditingId(position.id);
    setForm({
      name: position.name,
      display_order: position.display_order,
      at_the_board: position.at_the_board,
    });
    setSaveError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError(null);
    setIsSaving(true);

    try {
      const payload = {
        ...form,
        display_order: Number(form.display_order),
        at_the_board: isLockedAtTheBoard(form.name) ? true : form.at_the_board,
      };
      if (editingId) {
        await updateBoardPosition(editingId, payload);
      } else {
        await createBoardPosition(payload);
      }
      cancelEdit();
      await loadPositions();
    } catch (err) {
      setSaveError(err.detail || "Failed to save board position");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive(position) {
    if (position.active) {
      await deactivateBoardPosition(position.id);
    } else {
      await updateBoardPosition(position.id, { active: true });
    }
    await loadPositions();
  }

  async function handleDelete(position) {
    setDeleteError(null);
    setSuccessMessage(null);
    setDeletingId(position.id);
    try {
      const { count } = await getBoardPositionAssignmentCount(position.id);
      let message = `Are you sure you want to delete the position "${position.name}"? This action cannot be undone.`;
      if (count > 0) {
        message += `\n\nThis position is currently assigned to ${count} member${count === 1 ? "" : "s"}. Deleting it will remove their assignment.`;
      }
      if (!window.confirm(message)) {
        return;
      }
      await deleteBoardPositionPermanently(position.id);
      setSuccessMessage(`Position "${position.name}" deleted.`);
      if (editingId === position.id) cancelEdit();
      await loadPositions();
    } catch (err) {
      setDeleteError(err.detail || "Failed to delete board position");
    } finally {
      setDeletingId(null);
    }
  }

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>Board position definitions</h1>
        <p role="alert">You do not have permission to view board position definitions.</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <h1>Board position definitions</h1>

      {successMessage && <p role="status">{successMessage}</p>}
      {deleteError && <p role="alert">{deleteError}</p>}

      {canWrite && (
        <Card variant="default" className="!p-6 !rounded-2xl mb-6 max-w-[480px]">
          <form onSubmit={handleSubmit}>
            <h2 className="text-base font-bold text-[var(--color-brand-blue-dark)] mb-3">
              {editingId ? "Edit position" : "Add position"}
            </h2>
            <label htmlFor="position-name" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
              Name
            </label>
            <input
              id="position-name"
              type="text"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
              className="w-full border border-[var(--color-card-border)] rounded-lg px-3 py-2 text-sm mb-3"
            />
            <label htmlFor="position-display-order" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
              Display order
            </label>
            <input
              id="position-display-order"
              type="number"
              value={form.display_order}
              onChange={(event) => setForm({ ...form, display_order: event.target.value })}
              className="w-full border border-[var(--color-card-border)] rounded-lg px-3 py-2 text-sm mb-3"
            />
            <label htmlFor="position-at-the-board" className="flex items-center gap-2 text-sm text-[var(--color-brand-blue-dark)] mb-1">
              <input
                id="position-at-the-board"
                type="checkbox"
                checked={isLockedAtTheBoard(form.name) ? true : form.at_the_board}
                disabled={isLockedAtTheBoard(form.name)}
                onChange={(event) => setForm({ ...form, at_the_board: event.target.checked })}
              />
              At the board
            </label>
            {isLockedAtTheBoard(form.name) && (
              <p className="text-xs text-[var(--color-muted-text)] mb-3">
                President, Treasurer and Secretary are always board seats.
              </p>
            )}
            {saveError && <p role="alert">{saveError}</p>}
            <div className="flex gap-3 mt-3">
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-full px-6 py-2.5 text-[14.5px] font-semibold text-white bg-[var(--color-brand-blue)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSaving ? "Saving…" : editingId ? "Update position" : "Add position"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-full px-6 py-2.5 text-[14.5px] font-semibold text-[var(--color-muted-text-strong)] bg-[var(--color-border-light)] hover:bg-[var(--color-card-border)] cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </Card>
      )}

      <h2 className="text-[15px] font-bold text-[var(--color-brand-blue-dark)] mb-2">Board positions</h2>
      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}
      {!isLoading && !loadError && (
        <Card variant="default" className="!p-0 !rounded-2xl overflow-hidden">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-[var(--color-border-light)]">
                <th className="text-left px-5 py-3 text-xs font-bold text-[var(--color-muted-text)] uppercase tracking-wide">Name</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-[var(--color-muted-text)] uppercase tracking-wide">Display order</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-[var(--color-muted-text)] uppercase tracking-wide">At the board</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-[var(--color-muted-text)] uppercase tracking-wide">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {positions.map((position) => (
                <tr key={position.id} className="border-t border-[var(--color-border-light)]">
                  <td className="px-5 py-3 text-sm font-semibold text-[#0c2340]">{position.name}</td>
                  <td className="px-5 py-3 text-sm text-[var(--color-muted-text)]">{position.display_order}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold ${
                        position.at_the_board
                          ? "bg-[var(--color-brand-blue-light)] text-[var(--color-brand-blue)]"
                          : "bg-[var(--color-border-light)] text-[var(--color-muted-text)]"
                      }`}
                    >
                      {position.at_the_board ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold ${
                        position.active
                          ? "bg-[var(--tone-teal-bg)] text-[var(--color-tone-teal-text)]"
                          : "bg-[var(--color-border-light)] text-[var(--color-muted-text)]"
                      }`}
                    >
                      {position.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => startEdit(position)}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-blue)] bg-white border border-[var(--color-brand-blue)] cursor-pointer mr-2"
                      >
                        Edit
                      </button>
                    )}
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => handleToggleActive(position)}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--color-muted-text-strong)] bg-[var(--color-border-light)] cursor-pointer mr-2"
                      >
                        {position.active ? "Deactivate" : "Activate"}
                      </button>
                    )}
                    {canWrite && (
                      <button
                        type="button"
                        aria-label={`Delete ${position.name}`}
                        onClick={() => handleDelete(position)}
                        disabled={deletingId === position.id}
                        className="border-none bg-transparent text-[var(--color-muted-text)] cursor-pointer hover:text-[#b23b3b] align-middle"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
