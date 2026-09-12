import { useEffect, useMemo, useState } from "react";
import { Check, Filter, Search, UserPlus, FileText, X } from "lucide-react";
import { API_ORIGIN } from "../api/client";
import { COUNTRIES } from "../data/countries";
import { listMemberTitles } from "../api/memberTitles";
import { listHonorifics } from "../api/honorifics";
import {
  createMemberApplication,
  downloadMemberApplication,
  sendMemberApplication,
} from "../api/memberApplications";
import {
  createMember,
  listMembers,
  markMemberPast,
  updateMember,
  uploadMemberPhoto,
} from "../api/members";
import Card from "../components/Card";
import MultiSelectDropdown from "../components/MultiSelectDropdown";
import SingleSelectDropdown from "../components/SingleSelectDropdown";
import { useAccess } from "../hooks/useAccess";
import { useAuth } from "../hooks/useAuth";

const STATUS_LABELS = { active: "Active", past: "Past" };

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  status: "active",
  title_id: "",
  honorific_id: "",
  join_date: "",
  leave_date: "",
  rotarian_since: "",
  rotarian_id: "",
  photo_url: "",
  profession: "",
  classification: "",
  company_name: "",
  proposer_name: "",
  date_of_birth: "",
  gender: "",
  nationality: "",
  address: "",
  is_couple: false,
  is_honorary: false,
  is_charter_member: false,
  is_charter_president: false,
  is_past_president: false,
  notes: "",
};

const EMPTY_APPLICATION_FORM = { name: "", email: "", phone: "" };

// Story 8.3: a convenience default only — Gender doesn't determine
// Honorific (a Dr./Prof. can be any gender, Mrs./Ms. isn't derivable from
// Gender alone), so this just pre-fills a sensible starting value that
// stays fully editable via the Honorific dropdown itself.
const HONORIFIC_CODE_BY_GENDER = { Male: "MR", Female: "MS" };

function computeAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

function initials(member) {
  return `${member.first_name?.[0] ?? ""}${member.last_name?.[0] ?? ""}`.toUpperCase();
}

function resolvePhotoUrl(photoUrl) {
  if (!photoUrl) return null;
  return /^https?:\/\//.test(photoUrl) ? photoUrl : `${API_ORIGIN}${photoUrl}`;
}

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
  const { canRead, canWrite } = useAccess("members.directory");

  const [members, setMembers] = useState([]);
  const [titles, setTitles] = useState([]);
  const [honorifics, setHonorifics] = useState([]);
  // Story 8.3: Proposer name is a selection list of members — independent of
  // the directory's own status filter, so it always offers every member
  // (active and past) regardless of what's currently shown in the list.
  const [allMembersForProposer, setAllMembersForProposer] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [isApplicationModalOpen, setIsApplicationModalOpen] = useState(false);
  const [applicationForm, setApplicationForm] = useState(EMPTY_APPLICATION_FORM);
  const [applicationResult, setApplicationResult] = useState(null);
  const [isCreatingApplication, setIsCreatingApplication] = useState(false);
  const [applicationError, setApplicationError] = useState(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isDownloadingApplication, setIsDownloadingApplication] = useState(false);

  const [statusFilter, setStatusFilter] = useState("active");
  const [honoraryOnly, setHonoraryOnly] = useState(false);
  // Story 16.29: Title/Nationality are multi-select filters, stored as
  // arrays.
  const [titleFilters, setTitleFilters] = useState([]);
  const [nationalityFilters, setNationalityFilters] = useState([]);
  const [search, setSearch] = useState("");

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const titleById = useMemo(() => {
    const map = new Map();
    titles.forEach((title) => map.set(title.id, title));
    return map;
  }, [titles]);

  const dropdownTitles = useMemo(
    () => titles.filter((title) => title.is_active || title.id === form.title_id),
    [titles, form.title_id],
  );

  const dropdownHonorifics = useMemo(
    () => honorifics.filter((h) => h.is_active || h.id === form.honorific_id),
    [honorifics, form.honorific_id],
  );

  // Story 8.3: Proposer name is stored as a plain string (not a FK), so the
  // dropdown just offers every member's current name as an option — active
  // and past alike, since a proposer may since have left the club.
  const proposerNameOptions = useMemo(
    () =>
      [...allMembersForProposer]
        .map((member) => `${member.first_name} ${member.last_name}`)
        .sort((a, b) => a.localeCompare(b)),
    [allMembersForProposer],
  );

  async function loadTitles() {
    const data = await listMemberTitles({ includeInactive: true });
    setTitles(data);
  }

  async function loadHonorifics() {
    const data = await listHonorifics({ includeInactive: true });
    setHonorifics(data);
  }

  async function loadAllMembersForProposer() {
    const data = await listMembers();
    setAllMembersForProposer(data);
  }

  async function loadMembers() {
    setIsLoading(true);
    try {
      const filters = {};
      if (statusFilter) filters.status = statusFilter;
      if (honoraryOnly) filters.is_honorary = true;
      if (titleFilters.length > 0) filters.title_id = titleFilters;
      if (nationalityFilters.length > 0) filters.nationality = nationalityFilters;
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
    if (!canRead) return;
    // Best-effort, silently-ignored-if-it-403s — these three only feed
    // dropdown options, so there's no user-facing error state for them.
    // Still explicitly caught (not left unhandled) so a real 403/network
    // error doesn't surface as an unhandled promise rejection.
    loadTitles().catch(() => {});
    // Honorifics management is admin-role-only, but the dropdown of
    // *options* here just needs the list — same best-effort approach.
    loadHonorifics().catch(() => {});
    loadAllMembersForProposer().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead]);

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead, statusFilter, honoraryOnly, titleFilters, nationalityFilters]);

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

  const nationalityOptions = useMemo(
    () => [...new Set(members.map((member) => member.nationality).filter(Boolean))].sort(),
    [members],
  );

  function toggleTitleFilter(titleId) {
    setTitleFilters((current) =>
      current.includes(titleId) ? current.filter((id) => id !== titleId) : [...current, titleId],
    );
  }

  function toggleNationalityFilter(nationality) {
    setNationalityFilters((current) =>
      current.includes(nationality)
        ? current.filter((n) => n !== nationality)
        : [...current, nationality],
    );
  }

  function openAddModal() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
    setIsModalOpen(true);
  }

  function startEdit(member) {
    setSelectedMember(null);
    setEditingId(member.id);
    setForm({
      first_name: member.first_name ?? "",
      last_name: member.last_name ?? "",
      email: member.email ?? "",
      phone: member.phone ?? "",
      status: member.status ?? "active",
      title_id: member.title_id ?? "",
      honorific_id: member.honorific_id ?? "",
      join_date: member.join_date ?? "",
      leave_date: member.leave_date ?? "",
      rotarian_since: member.rotarian_since ?? "",
      rotarian_id: member.rotarian_id ?? "",
      photo_url: member.photo_url ?? "",
      profession: member.profession ?? "",
      classification: member.classification ?? "",
      company_name: member.company_name ?? "",
      proposer_name: member.proposer_name ?? "",
      date_of_birth: member.date_of_birth ?? "",
      gender: member.gender ?? "",
      nationality: member.nationality ?? "",
      address: member.address ?? "",
      is_couple: Boolean(member.is_couple),
      is_honorary: Boolean(member.is_honorary),
      is_charter_member: Boolean(member.is_charter_member),
      is_charter_president: Boolean(member.is_charter_president),
      is_past_president: Boolean(member.is_past_president),
      notes: member.notes ?? "",
    });
    setSaveError(null);
    setIsModalOpen(true);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
    setIsModalOpen(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError(null);

    if (form.nationality && !COUNTRIES.includes(form.nationality)) {
      setSaveError("Nationality must be selected from the list of countries");
      return;
    }

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

  async function handlePhotoChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingPhoto(true);
    setSaveError(null);
    try {
      const { photo_url } = await uploadMemberPhoto(file);
      setForm((prev) => ({ ...prev, photo_url }));
    } catch (err) {
      setSaveError(err.detail || "Failed to upload photo");
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  function openDetail(member) {
    setSelectedMember(member);
  }

  function closeDetail() {
    setSelectedMember(null);
  }

  async function handleMarkPast(member) {
    const fullName = `${member.first_name} ${member.last_name}`;
    if (!window.confirm(`Mark ${fullName} as past?`)) {
      return;
    }
    await markMemberPast(member.id);
    setSelectedMember(null);
    await loadMembers();
  }

  function openApplicationModal() {
    setApplicationForm(EMPTY_APPLICATION_FORM);
    setApplicationResult(null);
    setApplicationError(null);
    setIsApplicationModalOpen(true);
  }

  function closeApplicationModal() {
    setIsApplicationModalOpen(false);
  }

  async function handleCreateApplication(event) {
    event.preventDefault();
    setApplicationError(null);
    setIsCreatingApplication(true);
    try {
      const created = await createMemberApplication(applicationForm);
      setApplicationResult(created);
    } catch (err) {
      setApplicationError(err.detail || "Failed to generate application");
    } finally {
      setIsCreatingApplication(false);
    }
  }

  async function handleDownloadApplication() {
    setApplicationError(null);
    setIsDownloadingApplication(true);
    try {
      const { blob, filename } = await downloadMemberApplication(applicationResult.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setApplicationError(err.detail || "Failed to download the application PDF");
    } finally {
      setIsDownloadingApplication(false);
    }
  }

  async function handleSendApplication() {
    setApplicationError(null);
    setIsSendingEmail(true);
    try {
      const updated = await sendMemberApplication(applicationResult.id);
      setApplicationResult(updated);
    } catch (err) {
      setApplicationError(err.detail || "Failed to send application");
    } finally {
      setIsSendingEmail(false);
    }
  }

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>Members Directory</h1>
        <p role="alert">You do not have permission to view the Members directory.</p>
      </div>
    );
  }

  return (
    <div className="admin-page admin-page-wide">
      <div className="page-header-row">
        <h1>Members Directory</h1>
        {canWrite && (
          <div className="page-header-actions flex items-center gap-[9px]">
            <button
              type="button"
              onClick={openApplicationModal}
              className="inline-flex h-[38px] items-center gap-[7px] rounded-[8px] border border-[var(--border)] bg-transparent px-[15px] text-[13.5px] font-semibold text-[var(--ink-2)] hover:bg-[var(--bg-alt)]"
            >
              <FileText className="w-[15px] h-[15px]" aria-hidden="true" />
              Application
            </button>
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex h-[38px] items-center gap-[7px] rounded-[8px] bg-[var(--accent)] px-[15px] text-[13.5px] font-semibold text-white hover:bg-[var(--accent-ink)]"
            >
              <UserPlus className="w-[15px] h-[15px]" aria-hidden="true" />
              Add Member
            </button>
          </div>
        )}
      </div>

      {isApplicationModalOpen && canWrite && (
        <div className="modal-overlay members-modal-overlay" onClick={closeApplicationModal}>
          <div
            className="modal-dialog members-modal-dialog members-modal-dialog--narrow"
            onClick={(event) => event.stopPropagation()}
          >
            {!applicationResult ? (
              <form onSubmit={handleCreateApplication}>
                <h2>New member application</h2>
                <p className="admin-page-note">
                  Generates a fillable PDF application form pre-filled with these details —
                  the rest is left blank for the prospect to complete and sign.
                </p>

                <div className="member-form-grid members-form-grid members-form-grid--single">
                  <div className="field-full">
                    <label htmlFor="application-name">Name</label>
                    <input
                      id="application-name"
                      type="text"
                      value={applicationForm.name}
                      onChange={(event) =>
                        setApplicationForm({ ...applicationForm, name: event.target.value })
                      }
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="application-email">Email</label>
                    <input
                      id="application-email"
                      type="email"
                      value={applicationForm.email}
                      onChange={(event) =>
                        setApplicationForm({ ...applicationForm, email: event.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor="application-phone">Phone</label>
                    <input
                      id="application-phone"
                      type="text"
                      value={applicationForm.phone}
                      onChange={(event) =>
                        setApplicationForm({ ...applicationForm, phone: event.target.value })
                      }
                    />
                  </div>
                </div>

                {applicationError && <p role="alert">{applicationError}</p>}
                <div className="modal-actions">
                  <button type="submit" disabled={isCreatingApplication}>
                    {isCreatingApplication ? "Generating…" : "Generate application"}
                  </button>
                  <button type="button" onClick={closeApplicationModal}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <h2>Application generated</h2>
                <div className="px-[26px] pt-[18px] pb-[4px] flex flex-col gap-2">
                  <p>
                    <button
                      type="button"
                      className="btn-add-member"
                      onClick={handleDownloadApplication}
                      disabled={isDownloadingApplication}
                    >
                      {isDownloadingApplication ? "Downloading…" : "Download the PDF"}
                    </button>
                  </p>

                  {applicationError && <p role="alert">{applicationError}</p>}

                  <p>
                    {applicationResult.email_sent_at
                      ? `Emailed ${new Date(applicationResult.email_sent_at).toLocaleString()}`
                      : "Not emailed yet."}
                  </p>
                  <button
                    type="button"
                    className="btn-add-member"
                    onClick={handleSendApplication}
                    disabled={!applicationResult.email || isSendingEmail}
                  >
                    {isSendingEmail ? "Sending…" : "Send email"}
                  </button>
                </div>

                <div className="modal-actions">
                  <button type="button" onClick={closeApplicationModal}>
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {isModalOpen && canWrite && (
        <div className="modal-overlay members-modal-overlay" onClick={cancelEdit}>
          <div
            className="modal-dialog members-modal-dialog members-modal-dialog--wide"
            onClick={(event) => event.stopPropagation()}
          >
            <form onSubmit={handleSubmit}>
              <button
                type="button"
                onClick={cancelEdit}
                aria-label="Close"
                className="members-modal-x"
              >
                <X className="w-[17px] h-[17px]" aria-hidden="true" />
              </button>
              <div className="members-modal-kicker">
                <UserPlus className="w-[14px] h-[14px]" aria-hidden="true" />
                {editingId ? "Edit member" : "Add member"}
              </div>
              <h2>{editingId ? "Edit member" : "Add member"}</h2>
              {!editingId && (
                <p className="members-modal-sub">
                  Creates a member record directly from these details. All fields can be edited
                  later from the member&rsquo;s profile.
                </p>
              )}

              <div className="member-form-grid members-form-grid">
                <div>
                  <label htmlFor="member-first-name">First name</label>
                  <input
                    id="member-first-name"
                    type="text"
                    value={form.first_name}
                    onChange={(event) => setForm({ ...form, first_name: event.target.value })}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="member-last-name">Last name</label>
                  <input
                    id="member-last-name"
                    type="text"
                    value={form.last_name}
                    onChange={(event) => setForm({ ...form, last_name: event.target.value })}
                    required
                  />
                </div>
                <div>
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
                </div>
                <div>
                  <label htmlFor="member-honorific">Honorific</label>
                  <select
                    id="member-honorific"
                    value={form.honorific_id}
                    onChange={(event) => setForm({ ...form, honorific_id: event.target.value })}
                  >
                    <option value="">—</option>
                    {dropdownHonorifics.map((honorific) => (
                      <option key={honorific.id} value={honorific.id}>
                        {honorific.label}
                        {!honorific.is_active ? " (inactive)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="member-status">Status</label>
                  <select
                    id="member-status"
                    value={form.status}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        status: event.target.value,
                        // Story 8.14: honorary is only meaningful for Active
                        // members — clear it when moving a member to Past.
                        is_honorary:
                          event.target.value === "active" ? current.is_honorary : false,
                      }))
                    }
                  >
                    <option value="active">Active</option>
                    <option value="past">Past</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="member-is-honorary">Honorary member</label>
                  <input
                    id="member-is-honorary"
                    type="checkbox"
                    checked={form.is_honorary}
                    disabled={form.status !== "active"}
                    onChange={(event) => setForm({ ...form, is_honorary: event.target.checked })}
                  />
                </div>
                <div>
                  <label htmlFor="member-is-charter-member">Charter member</label>
                  <input
                    id="member-is-charter-member"
                    type="checkbox"
                    checked={form.is_charter_member}
                    onChange={(event) => setForm({ ...form, is_charter_member: event.target.checked })}
                  />
                </div>
                <div>
                  <label htmlFor="member-is-charter-president">Charter president</label>
                  <input
                    id="member-is-charter-president"
                    type="checkbox"
                    checked={form.is_charter_president}
                    onChange={(event) => setForm({ ...form, is_charter_president: event.target.checked })}
                  />
                </div>
                <div>
                  <label htmlFor="member-is-past-president">Past president</label>
                  <input
                    id="member-is-past-president"
                    type="checkbox"
                    checked={form.is_past_president}
                    onChange={(event) => setForm({ ...form, is_past_president: event.target.checked })}
                  />
                </div>
                <div>
                  <label htmlFor="member-date-of-birth">Date of birth</label>
                  <input
                    id="member-date-of-birth"
                    type="date"
                    value={form.date_of_birth}
                    onChange={(event) => setForm({ ...form, date_of_birth: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="member-gender">Gender</label>
                  <select
                    id="member-gender"
                    value={form.gender}
                    onChange={(event) => {
                      const nextGender = event.target.value;
                      setForm((current) => {
                        // Story 8.3: default (not force) Honorific from
                        // Gender as a convenience — only when Honorific
                        // hasn't already been chosen, and only ever a
                        // suggestion the dropdown above can still override.
                        if (current.honorific_id) {
                          return { ...current, gender: nextGender };
                        }
                        const defaultCode = HONORIFIC_CODE_BY_GENDER[nextGender];
                        const defaultHonorific = defaultCode
                          ? honorifics.find((h) => h.code === defaultCode)
                          : null;
                        return {
                          ...current,
                          gender: nextGender,
                          honorific_id: defaultHonorific ? defaultHonorific.id : current.honorific_id,
                        };
                      });
                    }}
                  >
                    <option value="">—</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="member-nationality">Nationality</label>
                  <input
                    id="member-nationality"
                    type="text"
                    list="country-options"
                    autoComplete="off"
                    placeholder="Type to search…"
                    value={form.nationality}
                    onChange={(event) => setForm({ ...form, nationality: event.target.value })}
                  />
                  <datalist id="country-options">
                    {COUNTRIES.map((country) => (
                      <option key={country} value={country} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label htmlFor="member-classification">Classification</label>
                  <input
                    id="member-classification"
                    type="text"
                    value={form.classification}
                    onChange={(event) => setForm({ ...form, classification: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="member-profession">Profession / Position</label>
                  <input
                    id="member-profession"
                    type="text"
                    value={form.profession}
                    onChange={(event) => setForm({ ...form, profession: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="member-company-name">Company name</label>
                  <input
                    id="member-company-name"
                    type="text"
                    value={form.company_name}
                    onChange={(event) => setForm({ ...form, company_name: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="member-proposer-name">Proposer name</label>
                  <select
                    id="member-proposer-name"
                    value={form.proposer_name}
                    onChange={(event) => setForm({ ...form, proposer_name: event.target.value })}
                  >
                    <option value="">—</option>
                    {form.proposer_name && !proposerNameOptions.includes(form.proposer_name) && (
                      <option value={form.proposer_name}>{form.proposer_name}</option>
                    )}
                    {proposerNameOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="member-is-couple">Couple membership</label>
                  <input
                    id="member-is-couple"
                    type="checkbox"
                    checked={form.is_couple}
                    onChange={(event) => setForm({ ...form, is_couple: event.target.checked })}
                  />
                </div>

                <div>
                  <label htmlFor="member-email">Email</label>
                  <input
                    id="member-email"
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="member-phone">Phone</label>
                  <input
                    id="member-phone"
                    type="text"
                    value={form.phone}
                    onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="member-photo-file">Photo</label>
                  <input
                    id="member-photo-file"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={handlePhotoChange}
                    disabled={isUploadingPhoto}
                  />
                  {isUploadingPhoto && <span>Uploading…</span>}
                  {form.photo_url && !isUploadingPhoto && (
                    <img
                      className="member-photo-preview"
                      src={resolvePhotoUrl(form.photo_url)}
                      alt="Preview"
                    />
                  )}
                </div>

                <div>
                  <label htmlFor="member-join-date">Join date</label>
                  <input
                    id="member-join-date"
                    type="date"
                    value={form.join_date}
                    onChange={(event) => setForm({ ...form, join_date: event.target.value })}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="member-leave-date">Leave date</label>
                  <input
                    id="member-leave-date"
                    type="date"
                    value={form.leave_date}
                    onChange={(event) => setForm({ ...form, leave_date: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="member-rotarian-since">Rotarian since (other club)</label>
                  <input
                    id="member-rotarian-since"
                    type="date"
                    value={form.rotarian_since}
                    onChange={(event) => setForm({ ...form, rotarian_since: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="member-rotarian-id">Rotarian ID (RI #)</label>
                  <input
                    id="member-rotarian-id"
                    type="text"
                    value={form.rotarian_id}
                    onChange={(event) => setForm({ ...form, rotarian_id: event.target.value })}
                  />
                </div>

                <div className="field-full">
                  <label htmlFor="member-address">Address</label>
                  <input
                    id="member-address"
                    type="text"
                    value={form.address}
                    onChange={(event) => setForm({ ...form, address: event.target.value })}
                  />
                </div>
                <div className="field-full">
                  <label htmlFor="member-notes">Notes</label>
                  <input
                    id="member-notes"
                    type="text"
                    value={form.notes}
                    onChange={(event) => setForm({ ...form, notes: event.target.value })}
                  />
                </div>
              </div>

              {saveError && (
                <p role="alert" className="px-[26px]">
                  {saveError}
                </p>
              )}
              <div className="modal-actions">
                <button type="submit" disabled={isSaving}>
                  {!isSaving && <Check className="w-4 h-4" aria-hidden="true" />}
                  {isSaving ? "Saving…" : editingId ? "Update member" : "Submit"}
                </button>
                <button type="button" onClick={cancelEdit}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="mb-[22px] flex flex-wrap items-center gap-[10px]">
        <div className="flex h-[38px] flex-1 min-w-[240px] items-center gap-[9px] rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-[13px]">
          <Search className="w-4 h-4 shrink-0 text-[var(--faint)]" aria-hidden="true" />
          <input
            id="filter-search"
            type="text"
            placeholder="Search by name or email…"
            aria-label="Search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full border-none bg-transparent text-[13.5px] text-[var(--ink)] outline-none placeholder:text-[var(--faint)]"
          />
        </div>

        <SingleSelectDropdown
          ariaLabel="Status"
          minWidthClass="min-w-[130px]"
          value={statusFilter}
          options={[
            { value: "active", label: "Active" },
            { value: "past", label: "Past" },
            { value: "", label: "All statuses" },
          ]}
          onSelect={setStatusFilter}
        />

        <label
          htmlFor="filter-honorary-only"
          className="inline-flex h-[38px] items-center gap-2 text-[13.5px] font-medium text-[var(--ink-2)]"
        >
          <input
            id="filter-honorary-only"
            type="checkbox"
            checked={honoraryOnly}
            onChange={(event) => setHonoraryOnly(event.target.checked)}
          />
          Honorary only
        </label>

        <MultiSelectDropdown
          icon={Filter}
          ariaLabel="Title"
          allLabel="All titles"
          options={titles.map((title) => ({ value: title.id, label: title.label }))}
          selected={titleFilters}
          onToggleOption={toggleTitleFilter}
          onClear={() => setTitleFilters([])}
        />

        <MultiSelectDropdown
          icon={Filter}
          ariaLabel="Nationality"
          allLabel="All nationalities"
          options={nationalityOptions.map((nationality) => ({
            value: nationality,
            label: nationality,
          }))}
          selected={nationalityFilters}
          onToggleOption={toggleNationalityFilter}
          onClear={() => setNationalityFilters([])}
        />
      </div>

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {selectedMember && (
        <div className="mb-4 max-w-3xl">
          <h2 className="mb-2 text-lg font-semibold text-[var(--color-brand-blue-dark)]">
            {selectedMember.first_name} {selectedMember.last_name}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card variant="default">
              <h3 className="mb-2 text-sm font-semibold text-[var(--color-brand-blue)]">
                Personal info
              </h3>
              <div className="flex flex-col gap-1 text-sm">
                <p>
                  Status: {STATUS_LABELS[selectedMember.status] ?? selectedMember.status}
                  {selectedMember.is_honorary ? " (Honorary)" : ""}
                </p>
                {selectedMember.email && <p>Email: {selectedMember.email}</p>}
                {selectedMember.phone && <p>Phone: {selectedMember.phone}</p>}
                {selectedMember.date_of_birth && (
                  <p>Date of birth: {selectedMember.date_of_birth}</p>
                )}
                {selectedMember.address && <p>Address: {selectedMember.address}</p>}
              </div>
            </Card>
            <Card variant="default">
              <h3 className="mb-2 text-sm font-semibold text-[var(--color-brand-blue)]">
                Membership &amp; tenure
              </h3>
              <div className="flex flex-col gap-1 text-sm">
                <p>Join date: {selectedMember.join_date}</p>
                {selectedMember.profession && <p>Profession: {selectedMember.profession}</p>}
                {selectedMember.rotarian_id && <p>Rotarian ID: {selectedMember.rotarian_id}</p>}
              </div>
            </Card>
            <Card variant="default">
              <h3 className="mb-2 text-sm font-semibold text-[var(--color-brand-blue)]">Notes</h3>
              <p className="text-sm">{selectedMember.notes || "—"}</p>
            </Card>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" className="px-4 py-2 text-sm font-semibold cursor-pointer" onClick={closeDetail}>
              Close
            </button>
            {canWrite && (
              <button
                type="button"
                className="px-4 py-2 text-sm font-semibold cursor-pointer"
                onClick={() => startEdit(selectedMember)}
              >
                Edit
              </button>
            )}
            {isAdmin && selectedMember.status !== "past" && (
              <button
                type="button"
                className="px-4 py-2 text-sm font-semibold cursor-pointer"
                onClick={() => handleMarkPast(selectedMember)}
              >
                Mark as past
              </button>
            )}
          </div>
        </div>
      )}

      {!isLoading && !loadError && visibleMembers.length === 0 && (
        <p className="member-empty-state">No members match your search or filters.</p>
      )}

      {!isLoading && !loadError && visibleMembers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 member-card-grid lg:grid-cols-4">
          {visibleMembers.map((member) => {
            const title = member.title_id ? titleById.get(member.title_id) : null;
            const age = computeAge(member.date_of_birth);
            const avatarSizeClass = "w-[60px] h-[60px]";
            return (
              <Card
                key={member.id}
                variant="default"
                className="flex flex-col items-center text-center gap-1 cursor-pointer transition-shadow !gap-[7px] !p-0 overflow-hidden"
                onClick={() => openDetail(member)}
              >
                {/* Role banner — every card has one; split for charter+PP combo */}
                {(() => {
                  const isCP = member.is_charter_president;
                  const isCM = member.is_charter_member && !isCP; // CP supersedes CM
                  const isPP = member.is_past_president && !isCP; // CP supersedes PP
                  const isHon = member.is_honorary;

                  const BANNER = "w-full py-[5px] px-2 text-[10.5px] font-bold uppercase tracking-widest text-center";

                  if (isCP) {
                    return (
                      <div className={`${BANNER} text-white bg-[var(--rotary-gold)]`}>
                        ★ Charter President
                      </div>
                    );
                  }
                  if (isCM && isPP) {
                    // Split: left = charter member (blue), right = past president (navy)
                    return (
                      <div className="w-full flex text-[10.5px] font-bold uppercase tracking-widest">
                        <div className="flex-1 py-[5px] text-center text-white bg-[var(--rotary-blue)]">✦ Charter</div>
                        <div className="flex-1 py-[5px] text-center text-white bg-[#0a2f6b]">Past Pres.</div>
                      </div>
                    );
                  }
                  if (isPP) {
                    return (
                      <div className={`${BANNER} text-white bg-[#0a2f6b]`}>
                        Past President
                      </div>
                    );
                  }
                  if (isCM) {
                    return (
                      <div className={`${BANNER} text-white bg-[var(--rotary-blue)]`}>
                        ✦ Charter Member
                      </div>
                    );
                  }
                  if (isHon) {
                    return (
                      <div className={`${BANNER} text-[#5b2d82] bg-[#ede7f6]`}>
                        Honorary Member
                      </div>
                    );
                  }
                  // Regular member — same height as labelled banners, no text
                  return (
                    <div className={`${BANNER} bg-[var(--bg-alt)]`} aria-hidden="true">&nbsp;</div>
                  );
                })()}
                <div className="flex flex-col items-center gap-[7px] p-[20px_16px] w-full">
                {member.photo_url ? (
                  <img
                    className={`${avatarSizeClass} rounded-full object-cover shrink-0 bg-[var(--accent-soft)]`}
                    src={resolvePhotoUrl(member.photo_url)}
                    alt=""
                  />
                ) : (
                  <div
                    className={`${avatarSizeClass} rounded-full flex items-center justify-center shrink-0 bg-[var(--accent-soft)] text-[19px] font-bold text-[var(--accent-ink)]`}
                  >
                    {initials(member)}
                  </div>
                )}
                <div className="min-w-0 w-full">
                  <div className="flex items-center justify-center gap-2">
                    <span className="truncate text-[14.5px] font-semibold text-[var(--ink)]">
                      {member.first_name} {member.last_name}
                    </span>
                    {title && (
                      <span className="shrink-0 text-[11px] font-semibold text-[var(--muted)]">
                        {title.code}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[12.5px] text-[var(--muted)]">
                    {[
                      age !== null ? `${age}y old` : null,
                      member.gender,
                      member.nationality,
                      member.classification,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <div className="text-[11.5px] text-[var(--faint)] mt-1">
                  {member.years_in_this_club}y in club · {member.years_as_rotarian}y as Rotarian
                </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
