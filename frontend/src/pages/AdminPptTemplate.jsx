import { useEffect, useRef, useState } from "react";
import {
  deletePptTemplate,
  fetchCurrentPptTemplate,
  uploadPptTemplate,
} from "../api/pptTemplates";
import Card from "../components/Card";
import { useAccess } from "../hooks/useAccess";

export default function AdminPptTemplate() {
  const { canRead, canWrite: canManage } = useAccess("admin.ppt_template");

  const [template, setTemplate] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const fileInputRef = useRef(null);

  async function loadTemplate() {
    setIsLoading(true);
    setLoadError(null);
    try {
      setTemplate(await fetchCurrentPptTemplate());
    } catch (err) {
      setLoadError(err.detail || "Failed to load the annual PPT template");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    loadTemplate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead]);

  async function handleFileSelected(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pptx")) {
      setUploadError("Only .pptx files are accepted");
      event.target.value = "";
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    try {
      const saved = await uploadPptTemplate(file);
      setTemplate(saved);
    } catch (err) {
      setUploadError(err.detail || "Failed to upload the template");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  async function handleDelete() {
    if (!window.confirm("Remove the annual PPT template? Reports will fall back to the default format.")) {
      return;
    }
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deletePptTemplate();
      setTemplate(null);
    } catch (err) {
      setDeleteError(err.detail || "Failed to remove the template");
    } finally {
      setIsDeleting(false);
    }
  }

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>PPT Template</h1>
        <p role="alert">You do not have permission to view the PPT Template.</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <h1>PPT Template</h1>
      <p className="mt-1 mb-5 text-sm text-[var(--color-muted-text)]">
        Upload the club's official annual PowerPoint template. When generating a PPT report,
        users can choose to apply this template as the slide master instead of the app's
        default format — one template is active per rotary year.
      </p>

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && (
        <Card variant="default" className="!p-6 !rounded-2xl max-w-[560px]">
          {template ? (
            <div className="flex items-center gap-3 px-3.5 py-3 bg-[var(--color-border-light)] rounded-xl mb-4">
              <div className="w-10 h-10 rounded-lg bg-[var(--color-brand-blue)] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                PPT
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[#0c2340] truncate">
                  {template.original_filename}
                </div>
                <div className="text-xs text-[var(--color-muted-text)]">
                  Uploaded {new Date(template.uploaded_at).toLocaleString()}
                  {template.uploaded_by_name ? ` by ${template.uploaded_by_name}` : ""}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--color-muted-text)] mb-4">No template uploaded yet.</p>
          )}

          {canManage && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pptx"
                aria-label={template ? "Replace template" : "Upload template"}
                onChange={handleFileSelected}
                disabled={isUploading}
                className="hidden"
              />
              <div
                onClick={() => !isUploading && fileInputRef.current?.click()}
                className="border-2 border-dashed border-[var(--color-card-border)] rounded-xl py-6 px-4 text-center cursor-pointer text-sm text-[var(--color-muted-text)] hover:border-[var(--color-brand-blue)] hover:text-[var(--color-brand-blue)]"
              >
                {isUploading
                  ? "Uploading…"
                  : template
                    ? "Click to replace the template"
                    : "Click to upload a .pptx template"}
              </div>
              {uploadError && <p role="alert">{uploadError}</p>}

              {template && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="mt-4 rounded-full px-6 py-2.5 text-[14.5px] font-semibold text-[#b23b3b] bg-[var(--tone-rose-bg)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isDeleting ? "Removing…" : "Delete template"}
                </button>
              )}
              {deleteError && <p role="alert">{deleteError}</p>}
            </>
          )}
        </Card>
      )}
    </div>
  );
}
