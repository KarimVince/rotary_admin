import { Calendar } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  deleteServiceProject,
  deleteServiceProjectDocument,
  downloadServiceProjectDocument,
  listServiceProjects,
  saveServiceProject,
  uploadServiceProjectDocument,
} from "../api/serviceProjects";
import Card from "./Card";
import SingleSelectDropdown from "./SingleSelectDropdown";
import { INPUT_CLASS, SELECT_CLASS } from "../styles/formControls";
import { rotaryYearLabel } from "../utils/rotaryYear";

// NGO Project File — the yearly preparation work for an NGO / internal club
// project: status, lead member, objectives, plan, outcome, and uploaded
// documents (proposals, budgets, MoUs, photos, reports). One record per
// rotary year; money and time stay in the Donations / Services sections.

const PROJECT_STATUSES = [
  { value: "idea", label: "Idea" },
  { value: "planning", label: "Planning" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
];
const STATUS_LABELS = Object.fromEntries(PROJECT_STATUSES.map((s) => [s.value, s.label]));

const ACCEPTED_FILE_TYPES =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.jpg,.jpeg,.png,.webp,.heic";

const EMPTY_FORM = { status: "planning", lead_member_id: "", objectives: "", plan: "", outcome: "" };

const ACTION_BUTTON_CLASS =
  "bg-transparent border-none p-0 mr-4 text-[13px] font-semibold text-[var(--accent)] hover:text-[var(--accent-ink)] cursor-pointer";
const DELETE_BUTTON_CLASS =
  "bg-transparent border-none p-0 text-[13px] font-semibold text-[var(--low)] hover:opacity-80 cursor-pointer";
const SUBMIT_BUTTON_CLASS =
  "rounded-lg px-4 py-2 text-[13.5px] font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-ink)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border-none";
const SECONDARY_BUTTON_CLASS =
  "rounded-lg px-4 py-2 text-[13.5px] font-semibold text-[var(--low)] bg-transparent border border-[var(--border)] hover:bg-[var(--bg-alt)] cursor-pointer";
const CELL_CLASS = "px-5 py-[12px] text-[14px] text-[var(--color-muted-text)]";
const TEXTAREA_CLASS = `${INPUT_CLASS} min-h-[84px]`;

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function projectToForm(project) {
  if (!project) return EMPTY_FORM;
  return {
    status: project.status,
    lead_member_id: project.lead_member_id ?? "",
    objectives: project.objectives ?? "",
    plan: project.plan ?? "",
    outcome: project.outcome ?? "",
  };
}

function ReadOnlyField({ label, value }) {
  return (
    <div className="field-full">
      <span className="block text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]">
        {label}
      </span>
      <p className="mt-1 whitespace-pre-wrap text-[14px] text-[var(--ink-2)]">{value || "—"}</p>
    </div>
  );
}

export default function OrganisationProjectFile({
  organisationId,
  members,
  canWrite,
  yearOptions,
  defaultYear,
}) {
  const [projects, setProjects] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [selectedYear, setSelectedYear] = useState(defaultYear);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  const [saveError, setSaveError] = useState(null);

  const [uploadFile, setUploadFile] = useState(null);
  const [uploadDescription, setUploadDescription] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [documentError, setDocumentError] = useState(null);
  const fileInputRef = useRef(null);
  const hasPickedYear = useRef(false);

  // The central Rotary Years list loads asynchronously and may settle on a
  // different "current" year than the client-side fallback — follow it until
  // the user picks a year themselves.
  useEffect(() => {
    if (!hasPickedYear.current) setSelectedYear(defaultYear);
  }, [defaultYear]);

  function pickYear(year) {
    hasPickedYear.current = true;
    setSelectedYear(Number(year));
    setSaveMessage(null);
  }

  async function loadProjects() {
    try {
      setProjects(await listServiceProjects(organisationId));
      setLoadError(null);
    } catch (err) {
      setLoadError(err.detail || "Failed to load project file");
    }
  }

  useEffect(() => {
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organisationId]);

  const projectsByYear = useMemo(() => {
    const map = new Map();
    projects.forEach((project) => map.set(project.rotary_year, project));
    return map;
  }, [projects]);

  const selectedProject = projectsByYear.get(Number(selectedYear)) ?? null;

  // Re-sync the form whenever the year changes or that year's record reloads.
  useEffect(() => {
    setForm(projectToForm(selectedProject));
    setSaveError(null);
    setDocumentError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, selectedProject?.id, selectedProject?.last_updated_at]);

  const allYearOptions = useMemo(() => {
    const years = new Set([...(yearOptions ?? []), defaultYear, ...projects.map((p) => p.rotary_year)]);
    return Array.from(years)
      .filter((year) => year !== null && year !== undefined)
      .map(Number)
      .sort((a, b) => b - a);
  }, [yearOptions, defaultYear, projects]);

  async function handleSave(event) {
    event.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      await saveServiceProject(organisationId, selectedYear, {
        status: form.status,
        lead_member_id: form.lead_member_id || null,
        objectives: form.objectives,
        plan: form.plan,
        outcome: form.outcome,
      });
      await loadProjects();
      setSaveMessage("Project file saved");
    } catch (err) {
      setSaveError(err.detail || "Failed to save project file");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteProject() {
    if (
      !window.confirm(
        `Delete the ${rotaryYearLabel(selectedYear)} project file and all its documents? This cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      await deleteServiceProject(organisationId, selectedYear);
      setSaveMessage(null);
      await loadProjects();
    } catch (err) {
      setSaveError(err.detail || "Failed to delete project file");
    }
  }

  async function handleUpload(event) {
    event.preventDefault();
    if (!uploadFile) return;
    setIsUploading(true);
    setDocumentError(null);
    try {
      await uploadServiceProjectDocument(organisationId, selectedYear, uploadFile, uploadDescription.trim());
      setUploadFile(null);
      setUploadDescription("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadProjects();
    } catch (err) {
      setDocumentError(err.detail || "Failed to upload document");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDownload(document_) {
    setDocumentError(null);
    try {
      const { blob, filename } = await downloadServiceProjectDocument(
        organisationId,
        selectedYear,
        document_.id,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = document_.file_original_filename || filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDocumentError(err.detail || "Failed to download document");
    }
  }

  async function handleDeleteDocument(document_) {
    if (!window.confirm(`Delete "${document_.file_original_filename}"?`)) return;
    setDocumentError(null);
    try {
      await deleteServiceProjectDocument(organisationId, selectedYear, document_.id);
      await loadProjects();
    } catch (err) {
      setDocumentError(err.detail || "Failed to delete document");
    }
  }

  const documents = selectedProject?.documents ?? [];

  return (
    <section className="project-file-section mt-8" aria-labelledby="project-file-heading">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 id="project-file-heading" className="seclabel !mt-0">
          Project File
        </h2>
        <div className="flex flex-col gap-1.5 mb-2">
          <span className="pl-0.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]">
            Rotary year
          </span>
          <SingleSelectDropdown
            icon={Calendar}
            ariaLabel="Project file rotary year"
            minWidthClass="min-w-[170px]"
            value={String(selectedYear)}
            options={allYearOptions.map((year) => ({
              value: String(year),
              label: `${rotaryYearLabel(year)}${year === defaultYear ? " (current)" : ""}${
                projectsByYear.has(year) ? " •" : ""
              }`,
            }))}
            onSelect={pickYear}
          />
        </div>
      </div>
      <p className="text-[13px] text-[var(--ink-2)] max-w-[700px]">
        Preparation work and documents for this rotary year — objectives, plan, proposals, budgets,
        photos and final reports. Money and time are recorded in Donations and Services above.
      </p>

      {/* Previous years at a glance — click a year to open its file. */}
      {projects.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3" aria-label="Years with a project file">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => pickYear(project.rotary_year)}
              aria-pressed={project.rotary_year === Number(selectedYear)}
              className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold cursor-pointer ${
                project.rotary_year === Number(selectedYear)
                  ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                  : "border-[var(--border)] bg-transparent text-[var(--ink-2)] hover:bg-[var(--bg-alt)]"
              }`}
            >
              {rotaryYearLabel(project.rotary_year)} · {STATUS_LABELS[project.status]} ·{" "}
              {project.documents.length} doc{project.documents.length === 1 ? "" : "s"}
            </button>
          ))}
        </div>
      )}

      {loadError && <p role="alert">{loadError}</p>}

      <Card variant="default" className="!p-5 !rounded-2xl max-w-[900px] mt-4">
        {canWrite ? (
          <form onSubmit={handleSave} className="donation-form">
            <div>
              <label htmlFor="project-status">Status</label>
              <select
                id="project-status"
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value })}
                className={SELECT_CLASS}
              >
                {PROJECT_STATUSES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="project-lead">Project lead</label>
              <select
                id="project-lead"
                value={form.lead_member_id}
                onChange={(event) => setForm({ ...form, lead_member_id: event.target.value })}
                className={SELECT_CLASS}
              >
                <option value="">— Not assigned —</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.first_name} {member.last_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-full">
              <label htmlFor="project-objectives">Objectives</label>
              <textarea
                id="project-objectives"
                value={form.objectives}
                onChange={(event) => setForm({ ...form, objectives: event.target.value })}
                className={TEXTAREA_CLASS}
                placeholder="What should this project achieve this year?"
              />
            </div>
            <div className="field-full">
              <label htmlFor="project-plan">Plan &amp; preparation</label>
              <textarea
                id="project-plan"
                value={form.plan}
                onChange={(event) => setForm({ ...form, plan: event.target.value })}
                className={TEXTAREA_CLASS}
                placeholder="Steps, timeline, volunteers needed, budget notes…"
              />
            </div>
            <div className="field-full">
              <label htmlFor="project-outcome">Outcome / lessons learned</label>
              <textarea
                id="project-outcome"
                value={form.outcome}
                onChange={(event) => setForm({ ...form, outcome: event.target.value })}
                className={TEXTAREA_CLASS}
                placeholder="Results, beneficiaries reached, what to do differently next year…"
              />
            </div>
            {saveError && <p role="alert">{saveError}</p>}
            {saveMessage && <p role="status">{saveMessage}</p>}
            <div className="modal-actions flex gap-3 field-full">
              <button type="submit" disabled={isSaving} className={SUBMIT_BUTTON_CLASS}>
                {isSaving ? "Saving…" : "Save project file"}
              </button>
              {selectedProject && (
                <button type="button" onClick={handleDeleteProject} className={SECONDARY_BUTTON_CLASS}>
                  Delete project file
                </button>
              )}
            </div>
          </form>
        ) : selectedProject ? (
          <div className="donation-form">
            <ReadOnlyField label="Status" value={STATUS_LABELS[selectedProject.status]} />
            <ReadOnlyField label="Project lead" value={selectedProject.lead_member_name} />
            <ReadOnlyField label="Objectives" value={selectedProject.objectives} />
            <ReadOnlyField label="Plan & preparation" value={selectedProject.plan} />
            <ReadOnlyField label="Outcome / lessons learned" value={selectedProject.outcome} />
          </div>
        ) : (
          <p className="member-empty-state">No project file for {rotaryYearLabel(selectedYear)} yet.</p>
        )}
        {selectedProject?.last_updated_by_name && (
          <p className="mt-3 text-[12px] text-[var(--faint)]">
            Last updated by {selectedProject.last_updated_by_name} on{" "}
            {new Date(selectedProject.last_updated_at).toLocaleDateString()}
          </p>
        )}
      </Card>

      <h3 className="mt-5 text-[14px] font-bold text-[var(--ink)]">
        Documents — {rotaryYearLabel(selectedYear)}
      </h3>
      {documents.length === 0 ? (
        <p className="member-empty-state">No documents uploaded for this year yet.</p>
      ) : (
        <Card variant="default" className="!p-0 !rounded-2xl mt-3 overflow-hidden max-w-[900px]">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--color-border-faint)]">
                {["File", "Description", "Size", "Uploaded", ""].map((label) => (
                  <th
                    key={label || "actions"}
                    aria-label={label === "" ? "Actions" : undefined}
                    className="px-5 py-3 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {documents.map((document_) => (
                <tr key={document_.id} className="border-b border-[var(--color-border-light)] last:border-b-0">
                  <td className="px-5 py-[12px] text-[14px] font-semibold text-[var(--text-h)] break-all">
                    {document_.file_original_filename}
                  </td>
                  <td className={CELL_CLASS}>{document_.description ?? "—"}</td>
                  <td className={`${CELL_CLASS} whitespace-nowrap`}>{formatFileSize(document_.file_size_bytes)}</td>
                  <td className={CELL_CLASS}>
                    {new Date(document_.created_at).toLocaleDateString()}
                    {document_.uploaded_by_name ? ` · ${document_.uploaded_by_name}` : ""}
                  </td>
                  <td className="px-5 py-[12px] text-right whitespace-nowrap">
                    <button type="button" onClick={() => handleDownload(document_)} className={ACTION_BUTTON_CLASS}>
                      Download
                    </button>
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => handleDeleteDocument(document_)}
                        className={DELETE_BUTTON_CLASS}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {documentError && <p role="alert">{documentError}</p>}

      {canWrite && (
        <Card variant="default" className="!p-5 !rounded-2xl max-w-[900px] mt-3">
          <form onSubmit={handleUpload} className="donation-form">
            <div>
              <label htmlFor="project-document-file">Upload document</label>
              <input
                id="project-document-file"
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FILE_TYPES}
                onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="project-document-description">Description (optional)</label>
              <input
                id="project-document-description"
                type="text"
                maxLength={255}
                value={uploadDescription}
                onChange={(event) => setUploadDescription(event.target.value)}
                className={INPUT_CLASS}
                placeholder="e.g. Budget v2, Signed MoU, Event photos"
              />
            </div>
            <p className="field-full text-[12px] text-[var(--faint)] !mt-0">
              PDF, Word, Excel, PowerPoint, CSV, text or images — max 10 MB.
            </p>
            <div className="modal-actions flex gap-3 field-full">
              <button type="submit" disabled={!uploadFile || isUploading} className={SUBMIT_BUTTON_CLASS}>
                {isUploading ? "Uploading…" : "Upload"}
              </button>
            </div>
          </form>
        </Card>
      )}
    </section>
  );
}
