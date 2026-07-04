import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listMemberTitles } from "../api/memberTitles";
import { createMember, listMembers, markMemberPast, updateMember } from "../api/members";
import { useAuth } from "../hooks/useAuth";

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  status: "active",
  title_id: "",
  join_date: "",
  leave_date: "",
  profession: "",
  classification: "",
  date_of_birth: "",
  nationality: "",
  address: "",
  is_couple: false,
  notes: "",
};

function toPayload(form) {
  const payload = { ...form };
  Object.keys(payload).forEach((key) => {
    if (payload[key] === "") {
      payload[key] = null;
    }
  });
  return payload;
}

export default function MembersList() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [members, setMembers] = useState([]);
  const [titles, setTitles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [statusFilter, setStatusFilter] = useState("active");
  const [titleFilter, setTitleFilter] = useState("");
  const [search, setSearch] = useState("");

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const titleById = useMemo(() => {
    const map = new Map();
    titles.forEach((title) => map.set(title.id, title));
    return map;
  }, [titles]);

  const dropdownTitles = useMemo(
    () => titles.filter((title) => title.is_active || title.id === form.title_id),
    [titles, form.title_id],
  );

  async function loadTitles() {
    const data = await listMemberTitles({ includeInactive: true });
    setTitles(data);
  }

  async function loadMembers() {
    setIsLoading(true);
    try {
      const filters = {};
      if (statusFilter) filters.status = statusFilter;
      if (titleFilter) filters.title_id = titleFilter;
      const data = await listMembers(filters);
      setMembers(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.detail || "Failed to load members");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadTitles();
  }, []);

  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, titleFilter]);

  const visibleMembers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return members;
    return members.filter((member) => {
      const haystack = `${member.first_name} ${member.last_name} ${
        member.email ?? ""
      }`.toLowerCase();
      return haystack.includes(term);
    });
  }, [members, search]);

  function startEdit(member) {
    setEditingId(member.id);
    setForm({
      first_name: member.first_name ?? "",
      last_name: member.last_name ?? "",
      email: member.email ?? "",
      phone: member.phone ?? "",
      status: member.status ?? "active",
      title_id: member.title_id ?? "",
      join_date: member.join_date ?? "",
      leave_date: member.leave_date ?? "",
      profession: member.profession ?? "",
      classification: member.classification ?? "",
      date_of_birth: member.date_of_birth ?? "",
      nationality: member.nationality ?? "",
      address: member.address ?? "",
      is_couple: Boolean(member.is_couple),
      notes: member.notes ?? "",
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
      const payload = toPayload(form);
      if (editingId) {
        await updateMember(editingId, payload);
      } else {
        await createMember(payload);
      }
      cancelEdit();
      await loadMembers();
    } catch (err) {
      setSaveError(err.detail || "Failed to save member");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleMarkPast(member) {
    const fullName = `${member.first_name} ${member.last_name}`;
    if (!window.confirm(`Mark ${fullName} as past?`)) {
      return;
    }
    await markMemberPast(member.id);
    await loadMembers();
  }

  return (
    <div className="admin-page">
      <h1>Members</h1>
      <Link to="/members/statistics">View statistics</Link>
      {isAdmin && <Link to="/members/email">Email members</Link>}

      {isAdmin && (
        <form className="admin-form" onSubmit={handleSubmit}>
          <h2>{editingId ? "Edit member" : "Add member"}</h2>

          <label htmlFor="member-first-name">First name</label>
          <input
            id="member-first-name"
            type="text"
            value={form.first_name}
            onChange={(event) => setForm({ ...form, first_name: event.target.value })}
            required
          />

          <label htmlFor="member-last-name">Last name</label>
          <input
            id="member-last-name"
            type="text"
            value={form.last_name}
            onChange={(event) => setForm({ ...form, last_name: event.target.value })}
            required
          />

          <label htmlFor="member-email">Email</label>
          <input
            id="member-email"
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />

          <label htmlFor="member-phone">Phone</label>
          <input
            id="member-phone"
            type="text"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />

          <label htmlFor="member-title">Title</label>
          <select
            id="member-title"
            value={form.title_id}
            onChange={(event) => setForm({ ...form, title_id: event.target.value })}
          >
            <option value="">—</option>
            {dropdownTitles.map((title) => (
              <option key={title.id} value={title.id}>
                {title.label}
                {!title.is_active ? " (inactive)" : ""}
              </option>
            ))}
          </select>

          <label htmlFor="member-join-date">Join date</label>
          <input
            id="member-join-date"
            type="date"
            value={form.join_date}
            onChange={(event) => setForm({ ...form, join_date: event.target.value })}
            required
          />

          <label htmlFor="member-leave-date">Leave date</label>
          <input
            id="member-leave-date"
            type="date"
            value={form.leave_date}
            onChange={(event) => setForm({ ...form, leave_date: event.target.value })}
          />

          <label htmlFor="member-date-of-birth">Date of birth</label>
          <input
            id="member-date-of-birth"
            type="date"
            value={form.date_of_birth}
            onChange={(event) => setForm({ ...form, date_of_birth: event.target.value })}
          />

          <label htmlFor="member-nationality">Nationality</label>
          <input
            id="member-nationality"
            type="text"
            value={form.nationality}
            onChange={(event) => setForm({ ...form, nationality: event.target.value })}
          />

          <label htmlFor="member-classification">Classification</label>
          <input
            id="member-classification"
            type="text"
            value={form.classification}
            onChange={(event) => setForm({ ...form, classification: event.target.value })}
          />

          <label htmlFor="member-profession">Profession</label>
          <input
            id="member-profession"
            type="text"
            value={form.profession}
            onChange={(event) => setForm({ ...form, profession: event.target.value })}
          />

          <label htmlFor="member-address">Address</label>
          <input
            id="member-address"
            type="text"
            value={form.address}
            onChange={(event) => setForm({ ...form, address: event.target.value })}
          />

          <label htmlFor="member-notes">Notes</label>
          <input
            id="member-notes"
            type="text"
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
          />

          <label htmlFor="member-is-couple">
            <input
              id="member-is-couple"
              type="checkbox"
              checked={form.is_couple}
              onChange={(event) => setForm({ ...form, is_couple: event.target.checked })}
            />{" "}
            Couple membership
          </label>

          {saveError && <p role="alert">{saveError}</p>}
          <button type="submit" disabled={isSaving}>
            {isSaving ? "Saving…" : editingId ? "Update member" : "Add member"}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit}>
              Cancel
            </button>
          )}
        </form>
      )}

      <h2>Directory</h2>
      <div className="member-filters">
        <label htmlFor="filter-search">Search</label>
        <input
          id="filter-search"
          type="text"
          placeholder="Name or email"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label htmlFor="filter-status">Status</label>
        <select
          id="filter-status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="past">Past</option>
        </select>
        <label htmlFor="filter-title">Title</label>
        <select
          id="filter-title"
          value={titleFilter}
          onChange={(event) => setTitleFilter(event.target.value)}
        >
          <option value="">All</option>
          {titles.map((title) => (
            <option key={title.id} value={title.id}>
              {title.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}
      {!isLoading && !loadError && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Status</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {visibleMembers.map((member) => {
              const title = member.title_id ? titleById.get(member.title_id) : null;
              const displayName = title
                ? `${title.code} ${member.first_name} ${member.last_name}`
                : `${member.first_name} ${member.last_name}`;
              return (
                <tr key={member.id}>
                  <td>{displayName}</td>
                  <td>{member.email}</td>
                  <td>{member.status === "active" ? "Active" : "Past"}</td>
                  {isAdmin && (
                    <td>
                      <button type="button" onClick={() => startEdit(member)}>
                        Edit
                      </button>
                      {member.status === "active" && (
                        <button type="button" onClick={() => handleMarkPast(member)}>
                          Mark as past
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
