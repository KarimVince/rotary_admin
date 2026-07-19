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
      <form className="admin-form" onSubmit={handleSubmit}>
        <h2>{editingId ? "Edit position" : "Add position"}</h2>
        <label htmlFor="position-name">Name</label>
        <input
          id="position-name"
          type="text"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          required
        />
        <label htmlFor="position-display-order">Display order</label>
        <input
          id="position-display-order"
          type="number"
          value={form.display_order}
          onChange={(event) => setForm({ ...form, display_order: event.target.value })}
        />
        <label htmlFor="position-at-the-board">
          <input
            id="position-at-the-board"
            type="checkbox"
            checked={isLockedAtTheBoard(form.name) ? true : form.at_the_board}
            disabled={isLockedAtTheBoard(form.name)}
            onChange={(event) => setForm({ ...form, at_the_board: event.target.checked })}
          />
          {" "}At the board
        </label>
        {isLockedAtTheBoard(form.name) && (
          <p style={{ fontSize: 12, color: "var(--text-h)" }}>
            President, Treasurer and Secretary are always board seats.
          </p>
        )}
        {saveError && <p role="alert">{saveError}</p>}
        <button type="submit" disabled={isSaving}>
          {isSaving ? "Saving…" : editingId ? "Update position" : "Add position"}
        </button>
        {editingId && (
          <button type="button" onClick={cancelEdit}>
            Cancel
          </button>
        )}
      </form>
      )}

      <h2>Board positions</h2>
      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}
      {!isLoading && !loadError && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Display order</th>
              <th>At the board</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {positions.map((position) => (
              <tr key={position.id}>
                <td>{position.name}</td>
                <td>{position.display_order}</td>
                <td>{position.at_the_board ? "Yes" : "No"}</td>
                <td>{position.active ? "Active" : "Inactive"}</td>
                <td>
                  {canWrite && (
                  <button type="button" onClick={() => startEdit(position)}>
                    Edit
                  </button>
                  )}
                  {canWrite && (
                  <button type="button" onClick={() => handleToggleActive(position)}>
                    {position.active ? "Deactivate" : "Activate"}
                  </button>
                  )}
                  {canWrite && (
                  <button
                    type="button"
                    aria-label={`Delete ${position.name}`}
                    onClick={() => handleDelete(position)}
                    disabled={deletingId === position.id}
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
