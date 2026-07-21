import { useEffect, useState } from "react";
import { listMembers } from "../api/members";
import { createUser, deleteUser, listUsers, resetUserPassword, updateUser } from "../api/users";
import Card from "../components/Card";
import { useAuth } from "../hooks/useAuth";

const INPUT_CLASS = "w-full border border-[var(--color-card-border)] rounded-lg px-3 py-2 text-sm";
const PRIMARY_BUTTON_CLASS =
  "rounded-full px-6 py-2.5 text-[14.5px] font-semibold text-white bg-[var(--color-brand-blue)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";
const SECONDARY_BUTTON_CLASS =
  "rounded-full px-6 py-2.5 text-[14.5px] font-semibold text-[var(--color-muted-text-strong)] bg-[var(--color-border-light)] hover:bg-[var(--color-card-border)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";
const ROW_BUTTON_CLASS =
  "rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mr-2 border-none";

const ROLES = ["user", "treasurer", "admin"];
const EMPTY_CREATE_FORM = { email: "", full_name: "", password: "", role: "user" };
const EMPTY_EDIT_FORM = { full_name: "", email: "", role: "user", member_id: "", is_active: true };

export default function UserManagement() {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [form, setForm] = useState(EMPTY_CREATE_FORM);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const [resetTarget, setResetTarget] = useState(null);
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState(null);
  const [resetSuccessId, setResetSuccessId] = useState(null);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  async function loadData() {
    setIsLoading(true);
    try {
      const [usersData, membersData] = await Promise.all([listUsers(), listMembers({})]);
      setUsers(usersData);
      setMembers(membersData);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.detail || "Failed to load users");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    setCreateError(null);
    setIsCreating(true);

    try {
      await createUser(form);
      setForm(EMPTY_CREATE_FORM);
      await loadData();
    } catch (err) {
      setCreateError(err.detail || "Failed to create user");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleToggleActive(user) {
    await updateUser(user.id, { is_active: !user.is_active });
    await loadData();
  }

  async function handleRoleChange(user, role) {
    await updateUser(user.id, { role });
    await loadData();
  }

  function openEdit(user) {
    setEditingId(user.id);
    setEditForm({
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      member_id: user.member_id || "",
      is_active: user.is_active,
    });
    setSaveError(null);
  }

  function closeEdit() {
    setEditingId(null);
    setEditForm(EMPTY_EDIT_FORM);
    setSaveError(null);
  }

  async function handleEditSubmit(event) {
    event.preventDefault();
    setSaveError(null);
    setIsSaving(true);

    try {
      await updateUser(editingId, {
        full_name: editForm.full_name,
        email: editForm.email,
        role: editForm.role,
        member_id: editForm.member_id || null,
        is_active: editForm.is_active,
      });
      closeEdit();
      await loadData();
    } catch (err) {
      setSaveError(err.detail || "Failed to update user");
    } finally {
      setIsSaving(false);
    }
  }

  function openResetConfirm(user) {
    setResetTarget(user);
    setResetError(null);
  }

  function cancelResetConfirm() {
    setResetTarget(null);
    setResetError(null);
  }

  async function handleConfirmReset() {
    setIsResetting(true);
    setResetError(null);

    try {
      await resetUserPassword(resetTarget.id);
      setResetSuccessId(resetTarget.id);
      setResetTarget(null);
    } catch (err) {
      setResetError(err.detail || "Failed to send password reset email");
    } finally {
      setIsResetting(false);
    }
  }

  function openDeleteConfirm(user) {
    setDeleteTarget(user);
    setDeleteError(null);
  }

  function cancelDeleteConfirm() {
    setDeleteTarget(null);
    setDeleteError(null);
  }

  async function handleConfirmDelete() {
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteUser(deleteTarget.id);
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setDeleteError(err.detail || "Failed to delete user");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="admin-page">
      <h1>Manage Users</h1>
      <p className="mt-1 mb-5 text-sm text-[var(--color-muted-text)]">
        Grant or revoke database access for club administrators.
      </p>

      <Card variant="default" className="!p-6 !rounded-2xl mb-6">
        <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <h2 className="text-base font-bold text-[var(--color-brand-blue-dark)] sm:col-span-2 mb-1">
            Create user
          </h2>
          <div>
            <label htmlFor="new-user-email" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
              Email
            </label>
            <input
              id="new-user-email"
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              required
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="new-user-full-name" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
              Full name
            </label>
            <input
              id="new-user-full-name"
              type="text"
              value={form.full_name}
              onChange={(event) => setForm({ ...form, full_name: event.target.value })}
              required
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="new-user-password" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
              Temporary password
            </label>
            <input
              id="new-user-password"
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              minLength={8}
              required
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="new-user-role" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
              Role
            </label>
            <select
              id="new-user-role"
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value })}
              className={INPUT_CLASS}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
          {createError && (
            <p role="alert" className="sm:col-span-2">
              {createError}
            </p>
          )}
          <div className="sm:col-span-2">
            <button type="submit" disabled={isCreating} className={PRIMARY_BUTTON_CLASS}>
              {isCreating ? "Creating…" : "Create user"}
            </button>
          </div>
        </form>
      </Card>

      {editingId && (
        <div className="modal-overlay" onClick={closeEdit}>
          <div
            className="modal-dialog !rounded-2xl !max-w-[520px] !text-[15px]"
            role="dialog"
            aria-label="Edit user"
            onClick={(event) => event.stopPropagation()}
          >
            <form onSubmit={handleEditSubmit}>
              <h2 className="text-[19px] font-semibold text-[var(--color-brand-blue-dark)] mb-3">Edit user</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="edit-user-full-name" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
                    Full name
                  </label>
                  <input
                    id="edit-user-full-name"
                    type="text"
                    value={editForm.full_name}
                    onChange={(event) =>
                      setEditForm({ ...editForm, full_name: event.target.value })
                    }
                    required
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="edit-user-email" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
                    Email
                  </label>
                  <input
                    id="edit-user-email"
                    type="email"
                    value={editForm.email}
                    onChange={(event) => setEditForm({ ...editForm, email: event.target.value })}
                    required
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="edit-user-role" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
                    Role
                  </label>
                  <select
                    id="edit-user-role"
                    value={editForm.role}
                    disabled={editingId === currentUser?.id}
                    onChange={(event) => setEditForm({ ...editForm, role: event.target.value })}
                    className={INPUT_CLASS}
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="edit-user-member" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
                    Linked member
                  </label>
                  <select
                    id="edit-user-member"
                    value={editForm.member_id}
                    onChange={(event) =>
                      setEditForm({ ...editForm, member_id: event.target.value })
                    }
                    className={INPUT_CLASS}
                  >
                    <option value="">— None —</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.first_name} {member.last_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="edit-user-active" className="flex items-center gap-2 text-sm text-[var(--color-brand-blue-dark)]">
                    <input
                      id="edit-user-active"
                      type="checkbox"
                      checked={editForm.is_active}
                      disabled={editingId === currentUser?.id}
                      onChange={(event) =>
                        setEditForm({ ...editForm, is_active: event.target.checked })
                      }
                    />
                    Active
                  </label>
                  {editingId === currentUser?.id && (
                    <p className="mt-1 text-xs text-[var(--color-muted-text)]">
                      You can&apos;t change your own role or deactivate your own account.
                    </p>
                  )}
                </div>
              </div>
              {saveError && <p role="alert">{saveError}</p>}
              <div className="flex gap-3 mt-5">
                <button type="submit" disabled={isSaving} className={PRIMARY_BUTTON_CLASS}>
                  {isSaving ? "Saving…" : "Update user"}
                </button>
                <button type="button" onClick={closeEdit} className={SECONDARY_BUTTON_CLASS}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetTarget && (
        <div className="modal-overlay" onClick={cancelResetConfirm}>
          <div
            className="modal-dialog !rounded-2xl !max-w-[420px] !text-[15px]"
            role="alertdialog"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-[19px] font-semibold text-[var(--color-brand-blue-dark)]">Confirm password reset</h2>
            <p className="text-[var(--color-muted-text-strong)]">
              This will email a password reset link to <strong>{resetTarget.email}</strong>. The
              link expires in 1 hour. This cannot be undone.
            </p>
            {resetError && <p role="alert">{resetError}</p>}
            <div className="flex justify-end gap-3 mt-5">
              <button type="button" onClick={cancelResetConfirm} disabled={isResetting} className={SECONDARY_BUTTON_CLASS}>
                Cancel
              </button>
              <button type="button" onClick={handleConfirmReset} disabled={isResetting} className={PRIMARY_BUTTON_CLASS}>
                {isResetting ? "Sending…" : "Confirm send"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-overlay" onClick={cancelDeleteConfirm}>
          <div
            className="modal-dialog !rounded-2xl !max-w-[420px] !text-[15px]"
            role="alertdialog"
            aria-label="Confirm delete"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-[19px] font-semibold text-[var(--color-brand-blue-dark)]">Confirm delete</h2>
            <p className="text-[var(--color-muted-text-strong)]">
              Are you sure you want to delete <strong>{deleteTarget.full_name}</strong>? This
              action cannot be undone.
            </p>
            {deleteError && <p role="alert">{deleteError}</p>}
            <div className="flex justify-end gap-3 mt-5">
              <button type="button" onClick={cancelDeleteConfirm} disabled={isDeleting} className={SECONDARY_BUTTON_CLASS}>
                Cancel
              </button>
              <button type="button" onClick={handleConfirmDelete} disabled={isDeleting} className={PRIMARY_BUTTON_CLASS}>
                {isDeleting ? "Deleting…" : "Confirm delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <h2 className="text-[15px] font-bold text-[var(--color-brand-blue-dark)] mb-2">Users</h2>
      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}
      {!isLoading && !loadError && (
        <Card variant="default" className="!p-0 !rounded-2xl overflow-hidden">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-[var(--color-border-light)]">
                <th className="text-left px-5 py-3 text-xs font-bold text-[var(--color-muted-text)] uppercase tracking-wide">Email</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-[var(--color-muted-text)] uppercase tracking-wide">Name</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-[var(--color-muted-text)] uppercase tracking-wide">Role</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-[var(--color-muted-text)] uppercase tracking-wide">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = user.id === currentUser?.id;
                return (
                  <tr key={user.id} className="border-t border-[var(--color-border-light)]">
                    <td className="px-5 py-3 text-sm">{user.email}</td>
                    <td className="px-5 py-3 text-sm font-semibold text-[#0c2340]">{user.full_name}</td>
                    <td className="px-5 py-3">
                      <select
                        value={user.role}
                        aria-label={`Role for ${user.email}`}
                        disabled={isSelf}
                        onChange={(event) => handleRoleChange(user, event.target.value)}
                        className="border border-[var(--color-card-border)] rounded-md px-2 py-1 text-sm"
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold ${
                          user.is_active
                            ? "bg-[var(--tone-teal-bg)] text-[var(--color-tone-teal-text)]"
                            : "bg-[var(--color-border-light)] text-[var(--color-muted-text)]"
                        }`}
                      >
                        {user.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <button type="button" onClick={() => openEdit(user)} className={`${ROW_BUTTON_CLASS} text-[var(--color-brand-blue)] bg-white border border-[var(--color-brand-blue)]`}>
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(user)}
                        disabled={isSelf}
                        className={`${ROW_BUTTON_CLASS} text-[var(--color-muted-text-strong)] bg-[var(--color-border-light)]`}
                      >
                        {user.is_active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        type="button"
                        onClick={() => openResetConfirm(user)}
                        className={`${ROW_BUTTON_CLASS} text-[var(--color-muted-text-strong)] bg-[var(--color-border-light)]`}
                      >
                        Reset password
                      </button>
                      {resetSuccessId === user.id && (
                        <span className="text-xs text-[var(--color-tone-teal-text)] mr-2">Reset email sent.</span>
                      )}
                      <button
                        type="button"
                        onClick={() => openDeleteConfirm(user)}
                        disabled={isSelf}
                        title={isSelf ? "You cannot delete your own account" : undefined}
                        className={`${ROW_BUTTON_CLASS} text-[#b23b3b] bg-[var(--tone-rose-bg)]`}
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
      )}
    </div>
  );
}
