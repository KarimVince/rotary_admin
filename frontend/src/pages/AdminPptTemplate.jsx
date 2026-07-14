import { useEffect, useRef, useState } from "react";
import {
  deletePptTemplate,
  fetchCurrentPptTemplate,
  uploadPptTemplate,
} from "../api/pptTemplates";
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
      <p className="admin-page-note">
        Upload the club's official annual PowerPoint template. When generating a PPT report,
        users can choose to apply this template as the slide master instead of the app's
        default format — one template is active per rotary year.
      </p>

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && (
        <div className="admin-form">
          {template ? (
            <>
              <h2>Active template</h2>
              <p>
                <strong>{template.original_filename}</strong>
              </p>
              <p>
                Uploaded {new Date(template.uploaded_at).toLocaleString()}
                {template.uploaded_by_name ? ` by ${template.uploaded_by_name}` : ""}
              </p>
            </>
          ) : (
            <p>No template uploaded yet.</p>
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
              />
              {uploadError && <p role="alert">{uploadError}</p>}
              {isUploading && <p role="status">Uploading…</p>}

              {template && (
                <button type="button" onClick={handleDelete} disabled={isDeleting}>
                  {isDeleting ? "Removing…" : "Delete template"}
                </button>
              )}
              {deleteError && <p role="alert">{deleteError}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
