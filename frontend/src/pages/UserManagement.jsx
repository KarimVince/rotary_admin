import { useEffect, useState } from "react";
import { createUser, listUsers, updateUser } from "../api/users";

const ROLES = ["user", "treasurer", "admin"];
const EMPTY_FORM = { email: "", full_name: "", password: "", role: "user" };

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  async function loadUsers() {
    setIsLoading(true);
    try {
      const data = await listUsers();
      setUsers(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.detail || "Failed to load users");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    setCreateError(null);
    setIsCreating(true);

    try {
      await createUser(form);
      setForm(EMPTY_FORM);
      await loadUsers();
    } catch (err) {
      setCreateError(err.detail || "Failed to create user");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleToggleActive(user) {
    await updateUser(user.id, { is_active: !user.is_active });
    await loadUsers();
  }

  async function handleRoleChange(user, role) {
    await updateUser(user.id, { role });
    await loadUsers();
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
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.email}</td>
                <td>{user.full_name}</td>
                <td>
                  <select
                    value={user.role}
                    aria-label={`Role for ${user.email}`}
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
                  <button type="button" onClick={() => handleToggleActive(user)}>
                    {user.is_active ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
