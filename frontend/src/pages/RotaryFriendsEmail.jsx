import { useEffect, useMemo, useRef, useState } from "react";
import { uploadEmailAttachment } from "../api/memberEmail";
import { listRotaryFriendEmailLog, sendRotaryFriendEmail } from "../api/rotaryFriendEmail";
import { listRotaryFriends } from "../api/rotaryFriends";
import {
  createEmailDraft,
  deleteEmailDraft,
  listEmailDrafts,
  updateEmailDraft,
} from "../api/emailDrafts";
import EmailAttachmentsCard from "../components/EmailAttachmentsCard";
import EmailDraftsPanel from "../components/EmailDraftsPanel";
import EmailLogTable from "../components/EmailLogTable";
import RecipientPicker from "../components/RecipientPicker";
import RichTextEditor from "../components/RichTextEditor";
import { useAccess } from "../hooks/useAccess";
import { getInitials } from "../utils/avatar";
import { splitTags } from "../utils/tags";

const SOURCE_MODULE = "rotary_friends";

export default function RotaryFriendsEmail() {
  const { canRead, canWrite: canSendEmail } = useAccess("friends.send_message");
  const [friends, setFriends] = useState([]);
  const [emailLog, setEmailLog] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [subject, setSubject] = useState("");
  const [bodyEmpty, setBodyEmpty] = useState(true);
  const [selectedFriendIds, setSelectedFriendIds] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [attachmentError, setAttachmentError] = useState(null);

  const [isConfirming, setIsConfirming] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  // Story 16.19 — see MembersEmail.jsx for the same pattern.
  const [editingDraftId, setEditingDraftId] = useState(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftError, setDraftError] = useState(null);

  const editorRef = useRef(null);
  const bodyRef = useRef("");
  const attachmentsCardRef = useRef(null);
  const imageInputRef = useRef(null);

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
      const [friendsData, logData] = await Promise.all([
        listRotaryFriends(),
        listRotaryFriendEmailLog(),
      ]);
      setFriends(friendsData);
      setEmailLog(logData);
      setLoadError(null);
      if (canSendEmail) await loadDrafts();
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
  }, [canRead]);

  const friendsWithEmail = useMemo(() => friends.filter((friend) => friend.email), [friends]);

  const tagOptions = useMemo(
    () => [...new Set(friends.flatMap((friend) => splitTags(friend.tags)))].sort(),
    [friends],
  );

  const quickFilters = useMemo(
    () => [
      { key: "all", label: "All", predicate: () => true },
      ...tagOptions.map((tag) => ({
        key: `tag:${tag}`,
        label: tag,
        predicate: (friend) => splitTags(friend.tags).includes(tag),
      })),
    ],
    [tagOptions],
  );

  const recipientPeople = useMemo(
    () =>
      friendsWithEmail.map((friend) => ({
        id: friend.id,
        name: `${friend.first_name} ${friend.last_name}`,
        initials: getInitials(friend.first_name, friend.last_name),
        sublabel: friend.tags || undefined,
        tags: friend.tags,
      })),
    [friendsWithEmail],
  );

  const recipientCount = selectedFriendIds.length;

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

  function handleReview(event) {
    event.preventDefault();
    if (!canSendEmail) return;
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
      const payload = { subject, body: bodyRef.current, friend_ids: selectedFriendIds };
      if (attachments.length > 0) {
        payload.attachments = attachments.map(({ filename, url }) => ({ filename, url }));
      }
      const result = await sendRotaryFriendEmail(payload);
      // Story 16.19: sending a draft removes it from the drafts list.
      if (editingDraftId) {
        await deleteEmailDraft(editingDraftId).catch(() => {});
        setEditingDraftId(null);
      }
      setLastResult(result);
      setIsConfirming(false);
      setSubject("");
      editorRef.current?.setHTML("");
      setSelectedFriendIds([]);
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
        friend_ids: selectedFriendIds,
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
    setSelectedFriendIds(draft.friend_ids ?? []);
    setAttachments(draft.attachments ?? []);
  }

  async function handleDeleteDraft(draft) {
    if (!window.confirm("Delete this draft?")) return;
    await deleteEmailDraft(draft.id);
    if (editingDraftId === draft.id) setEditingDraftId(null);
    await loadDrafts();
  }

  const canSend =
    canSendEmail && subject.trim() !== "" && !bodyEmpty && recipientCount > 0 && !isLoading && !loadError;
  const canSaveDraft =
    canSendEmail && (subject.trim() !== "" || !bodyEmpty || recipientCount > 0) && !isSavingDraft;

  if (!canRead) {
    return (
      <div className="admin-page admin-page-wide">
        <h1>Email Rotary Friends</h1>
        <p role="alert">You do not have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="admin-page admin-page-wide" style={{ maxWidth: 1600 }}>
      <h1>Email Rotary Friends</h1>
      <p className="mt-1 mb-5 text-sm text-[var(--color-muted-text)]">
        Reach the friends of Rotary.
      </p>

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && (
        <>
          <form onSubmit={handleReview} className="max-w-[760px] flex flex-col gap-5 pb-24">
            <div className="border border-[var(--border)] rounded-[14px] bg-[var(--surface)] p-[22px_24px] flex flex-col gap-4">
              <RecipientPicker
                label="To · Friends of Rotary"
                people={recipientPeople}
                selectedIds={selectedFriendIds}
                onChange={setSelectedFriendIds}
                quickFilters={quickFilters}
              />

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="friends-email-subject"
                  className="text-[12px] font-semibold uppercase tracking-[.04em] text-[var(--ink-2)]"
                >
                  Subject
                </label>
                <input
                  id="friends-email-subject"
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
                  {lastResult.failure_count} failed (of {lastResult.recipient_count}
                  {lastResult.skipped_no_email_count > 0
                    ? `, ${lastResult.skipped_no_email_count} skipped — no email on file`
                    : ""}
                  ).
                </p>
              )}

              <div className="flex justify-end gap-[9px]">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={!canSaveDraft}
                  title={!canSendEmail ? "You do not have permission to send emails" : undefined}
                  className="inline-flex h-[38px] items-center rounded-[8px] border border-[var(--border)] bg-transparent px-4 text-[13.5px] font-semibold text-[var(--ink-2)] hover:bg-[var(--bg-alt)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isSavingDraft ? "Saving…" : "Save Draft"}
                </button>
                <button
                  type="submit"
                  disabled={!canSend}
                  title={!canSendEmail ? "You do not have permission to send emails" : undefined}
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

      {!isLoading && !loadError && <EmailLogTable entries={emailLog} />}
    </div>
  );
}
