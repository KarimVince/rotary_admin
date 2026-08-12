import { useEffect, useMemo, useRef, useState } from "react";
import { listEmailLog, sendMemberEmail, uploadEmailAttachment } from "../api/memberEmail";
import {
  createEmailDraft,
  deleteEmailDraft,
  listEmailDrafts,
  updateEmailDraft,
} from "../api/emailDrafts";
import { listMembers } from "../api/members";
import EmailAttachmentsCard from "../components/EmailAttachmentsCard";
import EmailDraftsPanel from "../components/EmailDraftsPanel";
import EmailLogTable from "../components/EmailLogTable";
import RecipientPicker from "../components/RecipientPicker";
import RichTextEditor from "../components/RichTextEditor";
import { useAccess } from "../hooks/useAccess";
import { getInitials } from "../utils/avatar";

const SOURCE_MODULE = "members";

export default function MembersEmail() {
  const { canRead, canWrite } = useAccess("members.email");
  const [members, setMembers] = useState([]);
  const [emailLog, setEmailLog] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [subject, setSubject] = useState("");
  const [bodyEmpty, setBodyEmpty] = useState(true);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [attachmentError, setAttachmentError] = useState(null);

  const [isConfirming, setIsConfirming] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  // Story 16.19: null while composing a brand-new message; set to the
  // draft's id after loading one for editing, or right after "Save Draft"
  // creates one — so a second save updates it in place instead of creating
  // a duplicate, and sending it deletes the right row.
  const [editingDraftId, setEditingDraftId] = useState(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftError, setDraftError] = useState(null);

  const editorRef = useRef(null);
  const bodyRef = useRef("");
  const attachmentsCardRef = useRef(null);

  async function loadDrafts() {
    try {
      setDrafts(await listEmailDrafts(SOURCE_MODULE));
    } catch {
      // Non-fatal — the compose form still works without the drafts list.
      setDrafts([]);
    }
  }

  async function loadData() {
    setIsLoading(true);
    try {
      // Member email only ever targets active members — past members are
      // never selectable (see doc/CLAUDE.md "Member email specifics").
      const [membersData, logData] = canWrite
        ? await Promise.all([listMembers({ status: "active" }), listEmailLog()])
        : [[], await listEmailLog()];
      setMembers(membersData);
      setEmailLog(logData);
      setLoadError(null);
      if (canWrite) await loadDrafts();
    } catch (err) {
      setLoadError(err.detail || "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead, canWrite]);

  const membersWithEmail = useMemo(() => members.filter((member) => member.email), [members]);

  const recipientPeople = useMemo(
    () =>
      membersWithEmail.map((member) => ({
        id: member.id,
        name: `${member.first_name} ${member.last_name}`,
        initials: getInitials(member.first_name, member.last_name),
      })),
    [membersWithEmail],
  );

  const recipientCount = selectedMemberIds.length;

  async function handleFilesSelected(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    setIsUploadingAttachment(true);
    setAttachmentError(null);
    try {
      const uploaded = await Promise.all(
        files.map(async (file) => {
          const attachment = await uploadEmailAttachment(file);
          return { ...attachment, size: file.size };
        }),
      );
      setAttachments((current) => [...current, ...uploaded]);
    } catch (err) {
      setAttachmentError(err.detail || "Failed to upload attachment");
    } finally {
      setIsUploadingAttachment(false);
    }
  }

  function removeAttachment(filename) {
    setAttachments((current) => current.filter((attachment) => attachment.filename !== filename));
  }

  async function handleInsertImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setAttachmentError(null);
    try {
      const attachment = await uploadEmailAttachment(file);
      editorRef.current?.insertImage(attachment.url, attachment.filename);
    } catch (err) {
      setAttachmentError(err.detail || "Failed to upload image");
    }
  }

  const imageInputRef = useRef(null);

  function handleReview(event) {
    event.preventDefault();
    setSendError(null);
    setLastResult(null);
    setIsConfirming(true);
  }

  function cancelConfirm() {
    setIsConfirming(false);
  }

  async function handleConfirmSend() {
    setIsSending(true);
    setSendError(null);

    try {
      const payload = { subject, body: bodyRef.current, member_ids: selectedMemberIds };
      if (attachments.length > 0) {
        payload.attachments = attachments.map(({ filename, url }) => ({ filename, url }));
      }
      const result = await sendMemberEmail(payload);
      // Story 16.19: sending a draft removes it from the drafts list.
      if (editingDraftId) {
        await deleteEmailDraft(editingDraftId).catch(() => {});
        setEditingDraftId(null);
      }
      setLastResult(result);
      setIsConfirming(false);
      setSubject("");
      editorRef.current?.setHTML("");
      setSelectedMemberIds([]);
      setAttachments([]);
      await loadData();
    } catch (err) {
      setSendError(err.detail || "Failed to send email");
      setIsConfirming(false);
    } finally {
      setIsSending(false);
    }
  }

  async function handleSaveDraft() {
    setIsSavingDraft(true);
    setDraftError(null);
    try {
      const payload = {
        source_module: SOURCE_MODULE,
        subject,
        body: bodyRef.current,
        member_ids: selectedMemberIds,
        attachments: attachments.map(({ filename, url }) => ({ filename, url })),
      };
      if (editingDraftId) {
        await updateEmailDraft(editingDraftId, payload);
      } else {
        const created = await createEmailDraft(payload);
        setEditingDraftId(created.id);
      }
      await loadDrafts();
    } catch (err) {
      setDraftError(err.detail || "Failed to save draft");
    } finally {
      setIsSavingDraft(false);
    }
  }

  function handleEditDraft(draft) {
    setDraftError(null);
    setEditingDraftId(draft.id);
    setSubject(draft.subject);
    bodyRef.current = draft.body;
    editorRef.current?.setHTML(draft.body);
    setBodyEmpty(!draft.body || draft.body === "<p></p>");
    setSelectedMemberIds(draft.member_ids ?? []);
    setAttachments(draft.attachments ?? []);
  }

  async function handleDeleteDraft(draft) {
    if (!window.confirm("Delete this draft?")) return;
    await deleteEmailDraft(draft.id);
    if (editingDraftId === draft.id) setEditingDraftId(null);
    await loadDrafts();
  }

  const canSend = subject.trim() !== "" && !bodyEmpty && recipientCount > 0;
  const canSaveDraft = subject.trim() !== "" || !bodyEmpty || recipientCount > 0;

  if (!canRead) {
    return (
      <div className="admin-page admin-page-wide">
        <h1>Email members</h1>
        <p role="alert">You do not have permission to view member email.</p>
      </div>
    );
  }

  return (
    <div className="admin-page admin-page-wide" style={{ maxWidth: 1600 }}>
      <h1>Email members</h1>
      <p className="mt-1 mb-5 text-sm text-[var(--color-muted-text)]">
        Compose a message to the membership.
      </p>

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && canWrite && (
        <>
          <form onSubmit={handleReview} className="max-w-[760px] flex flex-col gap-5 pb-24">
            <div className="border border-[var(--border)] rounded-[14px] bg-[var(--surface)] p-[22px_24px] flex flex-col gap-4">
              <RecipientPicker
                label="To · Members"
                people={recipientPeople}
                selectedIds={selectedMemberIds}
                onChange={setSelectedMemberIds}
              />

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="members-email-subject"
                  className="text-[12px] font-semibold uppercase tracking-[.04em] text-[var(--ink-2)]"
                >
                  Subject
                </label>
                <input
                  id="members-email-subject"
                  type="text"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="Subject"
                  className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-[13px] py-[10px] text-[13.5px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold uppercase tracking-[.04em] text-[var(--ink-2)]">
                  Message
                </span>
                <RichTextEditor
                  ref={editorRef}
                  onChange={(html) => {
                    bodyRef.current = html;
                  }}
                  onEmptyChange={setBodyEmpty}
                  extraButtons={[
                    { key: "attach", label: "Attach", onClick: () => attachmentsCardRef.current?.openPicker() },
                    { key: "image", label: "Image", onClick: () => imageInputRef.current?.click() },
                  ]}
                />
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleInsertImage}
                />
              </div>

              <EmailAttachmentsCard
                ref={attachmentsCardRef}
                attachments={attachments}
                isUploading={isUploadingAttachment}
                error={attachmentError}
                onFilesSelected={handleFilesSelected}
                onRemove={removeAttachment}
                bare
              />

              {sendError && (
                <p role="alert" className="text-[13px] text-[var(--low)]">
                  {sendError}
                </p>
              )}
              {draftError && (
                <p role="alert" className="text-[13px] text-[var(--low)]">
                  {draftError}
                </p>
              )}
              {lastResult && (
                <p className="text-[13px] text-[var(--ink-2)]">
                  Last send: {lastResult.status} — {lastResult.success_count} succeeded,{" "}
                  {lastResult.failure_count} failed (of {lastResult.recipient_count}).
                </p>
              )}

              <div className="flex justify-end gap-[9px]">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={!canSaveDraft || isSavingDraft}
                  className="inline-flex h-[38px] items-center rounded-[8px] border border-[var(--border)] bg-transparent px-4 text-[13.5px] font-semibold text-[var(--ink-2)] hover:bg-[var(--bg-alt)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isSavingDraft ? "Saving…" : "Save Draft"}
                </button>
                <button
                  type="submit"
                  disabled={!canSend}
                  className="inline-flex h-[38px] items-center rounded-[8px] border-none bg-[var(--accent)] px-4 text-[13.5px] font-semibold text-white hover:bg-[var(--accent-ink)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  Review send ({recipientCount} recipient{recipientCount === 1 ? "" : "s"})
                </button>
              </div>
            </div>
          </form>

          <EmailDraftsPanel drafts={drafts} onEdit={handleEditDraft} onDelete={handleDeleteDraft} />
        </>
      )}

      {isConfirming && (
        <div className="modal-overlay members-modal-overlay" onClick={cancelConfirm}>
          <div
            className="modal-dialog !rounded-2xl !max-w-[420px] !text-[15px] members-modal-dialog members-modal-dialog--narrow !p-6"
            role="alertdialog"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-[19px] font-semibold text-[var(--text-h)]">Confirm send</h2>
            <p className="text-[var(--color-muted-text-strong)]">
              This will email <strong>{recipientCount}</strong> recipient
              {recipientCount === 1 ? "" : "s"}
              {attachments.length > 0
                ? ` with ${attachments.length} attachment${attachments.length === 1 ? "" : "s"}`
                : ""}
              . This cannot be undone.
            </p>
            <div className="flex justify-end gap-3 mt-5">
              <button
                type="button"
                onClick={cancelConfirm}
                disabled={isSending}
                className="inline-flex h-[38px] items-center rounded-[8px] border border-[var(--border)] bg-transparent px-4 text-[13.5px] font-semibold text-[var(--ink-2)] hover:bg-[var(--bg-alt)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSend}
                disabled={isSending}
                className="inline-flex h-[38px] items-center rounded-[8px] border-none bg-[var(--accent)] px-4 text-[13.5px] font-semibold text-white hover:bg-[var(--accent-ink)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSending ? "Sending…" : "Confirm send"}
              </button>
            </div>
          </div>
        </div>
      )}

      {!isLoading && !loadError && canRead && <EmailLogTable entries={emailLog} />}
    </div>
  );
}
