import { useEffect, useState } from "react";
import { listMembers } from "../api/members";
import { createUser, listUsers, resetUserPassword, updateUser } from "../api/users";
import { useAuth } from "../hooks/useAuth";

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

  return (
    <div className="admin-page">
      <h1>User management</h1>

      <form className="admin-form" onSubmit={handleCreate}>
        <h2>Create user</h2>
        <label htmlFor="new-user-email">Email</label>
        <input
          id="new-user-email"
          type="email"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
          required
        />
        <label htmlFor="new-user-full-name">Full name</label>
        <input
          id="new-user-full-name"
          type="text"
          value={form.full_name}
          onChange={(event) => setForm({ ...form, full_name: event.target.value })}
          required
        />
        <label htmlFor="new-user-password">Temporary password</label>
        <input
          id="new-user-password"
          type="password"
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
          minLength={8}
          required
        />
        <label htmlFor="new-user-role">Role</label>
        <select
          id="new-user-role"
          value={form.role}
          onChange={(event) => setForm({ ...form, role: event.target.value })}
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        {createError && <p role="alert">{createError}</p>}
        <button type="submit" disabled={isCreating}>
          {isCreating ? "Creating…" : "Create user"}
        </button>
      </form>

      {editingId && (
        <div className="modal-overlay" onClick={closeEdit}>
          <div
            className="modal-dialog"
            role="dialog"
            aria-label="Edit user"
            onClick={(event) => event.stopPropagation()}
          >
            <form onSubmit={handleEditSubmit}>
              <h2>Edit user</h2>
              <div className="user-form-grid">
                <div>
                  <label htmlFor="edit-user-full-name">Full name</label>
                  <input
                    id="edit-user-full-name"
                    type="text"
                    value={editForm.full_name}
                    onChange={(event) =>
                      setEditForm({ ...editForm, full_name: event.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <label htmlFor="edit-user-email">Email</label>
                  <input
                    id="edit-user-email"
                    type="email"
                    value={editForm.email}
                    onChange={(event) => setEditForm({ ...editForm, email: event.target.value })}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="edit-user-role">Role</label>
                  <select
                    id="edit-user-role"
                    value={editForm.role}
                    disabled={editingId === currentUser?.id}
                    onChange={(event) => setEditForm({ ...editForm, role: event.target.value })}
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="edit-user-member">Linked member</label>
                  <select
                    id="edit-user-member"
                    value={editForm.member_id}
                    onChange={(event) =>
                      setEditForm({ ...editForm, member_id: event.target.value })
                    }
                  >
                    <option value="">— None —</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.first_name} {member.last_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field-full">
                  <label htmlFor="edit-user-active">
                    <input
                      id="edit-user-active"
                      type="checkbox"
                      checked={editForm.is_active}
                      disabled={editingId === currentUser?.id}
                      onChange={(event) =>
                        setEditForm({ ...editForm, is_active: event.target.checked })
                      }
                    />{" "}
                    Active
                  </label>
                  {editingId === currentUser?.id && (
                    <p className="admin-page-note">
                      You can&apos;t change your own role or deactivate your own account.
                    </p>
                  )}
                </div>
              </div>
              {saveError && <p role="alert">{saveError}</p>}
              <div className="modal-actions">
                <button type="submit" disabled={isSaving}>
                  {isSaving ? "Saving…" : "Update user"}
                </button>
                <button type="button" onClick={closeEdit}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetTarget && (
        <div className="admin-form" role="alertdialog">
          <h2>Confirm password reset</h2>
          <p>
            This will email a password reset link to <strong>{resetTarget.email}</strong>. The
            link expires in 1 hour. This cannot be undone.
          </p>
          {resetError && <p role="alert">{resetError}</p>}
          <button type="button" onClick={handleConfirmReset} disabled={isResetting}>
            {isResetting ? "Sending…" : "Confirm send"}
          </button>
          <button type="button" onClick={cancelResetConfirm} disabled={isResetting}>
            Cancel
          </button>
        </div>
      )}

      <h2>Users</h2>
      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}
      {!isLoading && !loadError && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Role</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isSelf = user.id === currentUser?.id;
              return (
                <tr key={user.id}>
                  <td>{user.email}</td>
                  <td>{user.full_name}</td>
                  <td>
                    <select
                      value={user.role}
                      aria-label={`Role for ${user.email}`}
                      disabled={isSelf}
                      onChange={(event) => handleRoleChange(user, event.target.value)}
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{user.is_active ? "Active" : "Inactive"}</td>
                  <td>
                    <button type="button" onClick={() => openEdit(user)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(user)}
                      disabled={isSelf}
                    >
                      {user.is_active ? "Deactivate" : "Activate"}
                    </button>
                    <button type="button" onClick={() => openResetConfirm(user)}>
                      Reset password
                    </button>
                    {resetSuccessId === user.id && <span> Reset email sent.</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
