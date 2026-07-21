import { forwardRef, useImperativeHandle, useRef } from "react";
import Card from "./Card";

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileExtensionBadge(filename) {
  const parts = filename.split(".");
  return (parts.length > 1 ? parts.pop() : "file").slice(0, 4).toUpperCase();
}

// Drag-and-drop attachments card. Exposes `openPicker()` via ref so the
// message body's toolbar "Attach" button can trigger the same hidden file
// input as the dropzone itself.
const EmailAttachmentsCard = forwardRef(function EmailAttachmentsCard(
  { attachments, isUploading, error, onFilesSelected, onRemove },
  ref,
) {
  const fileInputRef = useRef(null);

  useImperativeHandle(ref, () => ({
    openPicker() {
      fileInputRef.current?.click();
    },
  }));

  function handleDrop(event) {
    event.preventDefault();
    onFilesSelected(event.dataTransfer.files);
  }

  return (
    <Card variant="default" className="!p-5 !rounded-2xl">
      <div className="text-[13px] font-semibold text-[var(--color-muted-text)] mb-3">Attachments</div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          onFilesSelected(event.target.files);
          event.target.value = "";
        }}
      />
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        className="border-2 border-dashed border-[var(--color-card-border)] rounded-xl py-6 px-4 text-center cursor-pointer text-sm text-[var(--color-muted-text)] hover:border-[var(--color-brand-blue)] hover:text-[var(--color-brand-blue)]"
      >
        {isUploading ? "Uploading…" : "Drag files here, or click to browse"}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-[#b23b3b]">
          {error}
        </p>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-col gap-2 mt-3.5">
          {attachments.map((attachment) => (
            <div
              key={attachment.filename}
              className="flex items-center gap-2.5 px-2.5 py-2 bg-[var(--color-border-light)] rounded-lg"
            >
              <div className="w-8 h-8 rounded-lg bg-[var(--color-brand-blue)] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                {fileExtensionBadge(attachment.filename)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{attachment.filename}</div>
                {typeof attachment.size === "number" && (
                  <div className="text-xs text-[var(--color-muted-text)]">{formatFileSize(attachment.size)}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => onRemove(attachment.filename)}
                aria-label={`Remove ${attachment.filename}`}
                className="border-none bg-transparent text-[var(--color-muted-text)] cursor-pointer text-base hover:text-[#b23b3b]"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
});

export default EmailAttachmentsCard;
