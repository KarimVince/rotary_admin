import { useEffect, useMemo, useRef, useState } from "react";
import { uploadEmailAttachment } from "../api/memberEmail";
import { listRotaryFriendEmailLog, sendRotaryFriendEmail } from "../api/rotaryFriendEmail";
import { listRotaryFriends } from "../api/rotaryFriends";
import Card from "../components/Card";
import EmailAttachmentsCard from "../components/EmailAttachmentsCard";
import EmailLogTable from "../components/EmailLogTable";
import RecipientPicker from "../components/RecipientPicker";
import RichTextEditor from "../components/RichTextEditor";
import { useAccess } from "../hooks/useAccess";
import { getInitials } from "../utils/avatar";
import { splitTags } from "../utils/tags";

export default function RotaryFriendsEmail() {
  const { canRead, canWrite: canSendEmail } = useAccess("friends.send_message");
  const [friends, setFriends] = useState([]);
  const [emailLog, setEmailLog] = useState([]);
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

  const editorRef = useRef(null);
  const bodyRef = useRef("");
  const attachmentsCardRef = useRef(null);
  const imageInputRef = useRef(null);

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

  const canSend =
    canSendEmail && subject.trim() !== "" && !bodyEmpty && recipientCount > 0 && !isLoading && !loadError;

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>Email Rotary Friends</h1>
        <p role="alert">You do not have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <h1>Email Rotary Friends</h1>

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && (
        <>
          <form onSubmit={handleReview} className="max-w-[760px] flex flex-col gap-5 pb-24">
            <Card variant="default" className="!p-5 !rounded-2xl relative">
              <RecipientPicker
                label="To · Friends of Rotary"
                people={recipientPeople}
                selectedIds={selectedFriendIds}
                onChange={setSelectedFriendIds}
                quickFilters={quickFilters}
              />
            </Card>

            <Card variant="default" className="!p-0 !rounded-2xl">
              <div className="px-6 pt-1 pb-6">
                <input
                  type="text"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="Subject"
                  className="w-full border-none border-b border-[var(--color-card-border)] py-4 text-[19px] font-semibold text-[var(--color-brand-blue-dark)] outline-none"
                />
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
            </Card>

            <EmailAttachmentsCard
              ref={attachmentsCardRef}
              attachments={attachments}
              isUploading={isUploadingAttachment}
              error={attachmentError}
              onFilesSelected={handleFilesSelected}
              onRemove={removeAttachment}
            />

            {sendError && <p role="alert">{sendError}</p>}
            {lastResult && (
              <p>
                Last send: {lastResult.status} — {lastResult.success_count} succeeded,{" "}
                {lastResult.failure_count} failed (of {lastResult.recipient_count}
                {lastResult.skipped_no_email_count > 0
                  ? `, ${lastResult.skipped_no_email_count} skipped — no email on file`
                  : ""}
                ).
              </p>
            )}

            <div className="sticky bottom-0 bg-white border-t border-[var(--color-card-border)] py-4 flex justify-end">
              <button
                type="submit"
                disabled={!canSend}
                title={!canSendEmail ? "You do not have permission to send emails" : undefined}
                className="border-none rounded-full px-6 py-2.5 text-[14.5px] font-semibold text-white bg-[var(--color-brand-blue)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Review send ({recipientCount} recipient{recipientCount === 1 ? "" : "s"})
              </button>
            </div>
          </form>

          {isConfirming && (
            <div className="modal-overlay" onClick={cancelConfirm}>
              <div
                className="modal-dialog !rounded-2xl !max-w-[420px] !text-[15px]"
                role="alertdialog"
                onClick={(event) => event.stopPropagation()}
              >
                <h2 className="text-[19px] font-semibold text-[var(--color-brand-blue-dark)]">Confirm send</h2>
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
                    className="rounded-full px-6 py-2.5 text-[14.5px] font-semibold text-[var(--color-muted-text-strong)] bg-[var(--color-border-light)] hover:bg-[var(--color-card-border)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSend}
                    disabled={isSending}
                    className="rounded-full px-6 py-2.5 text-[14.5px] font-semibold text-white bg-[var(--color-brand-blue)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isSending ? "Sending…" : "Confirm send"}
                  </button>
                </div>
              </div>
            </div>
          )}

          <EmailLogTable entries={emailLog} />
        </>
      )}
    </div>
  );
}
