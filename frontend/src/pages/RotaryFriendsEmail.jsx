import { useEffect, useMemo, useState } from "react";
import { uploadEmailAttachment } from "../api/memberEmail";
import { listRotaryFriendEmailLog, sendRotaryFriendEmail } from "../api/rotaryFriendEmail";
import { listRotaryFriends } from "../api/rotaryFriends";
import { useAccess } from "../hooks/useAccess";
import { splitTags } from "../utils/tags";

export default function RotaryFriendsEmail() {
  const { canRead, canWrite: canSendEmail } = useAccess("friends.send_message");
  const [friends, setFriends] = useState([]);
  const [emailLog, setEmailLog] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipientMode, setRecipientMode] = useState("all");
  const [tag, setTag] = useState("");
  const [selectedFriendIds, setSelectedFriendIds] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [attachmentError, setAttachmentError] = useState(null);

  const [isConfirming, setIsConfirming] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [lastResult, setLastResult] = useState(null);

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

  const matchingFriends = useMemo(() => {
    if (recipientMode === "custom") {
      return friends.filter((friend) => selectedFriendIds.includes(friend.id));
    }
    if (recipientMode === "tag" && tag) {
      return friends.filter((friend) => splitTags(friend.tags).includes(tag));
    }
    if (recipientMode === "all") {
      return friends;
    }
    return [];
  }, [recipientMode, tag, selectedFriendIds, friends]);

  const recipientCount = matchingFriends.filter((friend) => friend.email).length;
  const skippedCount = matchingFriends.length - recipientCount;

  function toggleFriend(friendId) {
    setSelectedFriendIds((current) =>
      current.includes(friendId)
        ? current.filter((id) => id !== friendId)
        : [...current, friendId],
    );
  }

  async function handleAttachmentChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingAttachment(true);
    setAttachmentError(null);
    try {
      const attachment = await uploadEmailAttachment(file);
      setAttachments((current) => [...current, attachment]);
    } catch (err) {
      setAttachmentError(err.detail || "Failed to upload attachment");
    } finally {
      setIsUploadingAttachment(false);
      event.target.value = "";
    }
  }

  function removeAttachment(filename) {
    setAttachments((current) => current.filter((attachment) => attachment.filename !== filename));
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
      const payload = { subject, body };
      if (recipientMode === "custom") {
        payload.friend_ids = selectedFriendIds;
      } else if (recipientMode === "tag") {
        payload.tag = tag;
      } else {
        payload.recipient_group = "all";
      }
      if (attachments.length > 0) {
        payload.attachments = attachments;
      }
      const result = await sendRotaryFriendEmail(payload);
      setLastResult(result);
      setIsConfirming(false);
      setSubject("");
      setBody("");
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
    canSendEmail &&
    recipientCount > 0 &&
    (recipientMode !== "tag" || tag) &&
    !isLoading &&
    !loadError;

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
          <form className="admin-form email-compose-form" onSubmit={handleReview}>
            <h2>Compose</h2>

            <label htmlFor="friend-email-subject">Subject</label>
            <input
              id="friend-email-subject"
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              required
            />

            <label htmlFor="friend-email-body">Body</label>
            <textarea
              id="friend-email-body"
              className="email-body-textarea"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              required
            />

            <div className="email-controls-row">
              <div>
                <label htmlFor="friend-recipient-mode">Send to</label>
                <select
                  id="friend-recipient-mode"
                  value={recipientMode}
                  onChange={(event) => setRecipientMode(event.target.value)}
                >
                  <option value="all">All friends</option>
                  <option value="tag">By tag</option>
                  <option value="custom">Custom selection</option>
                </select>
              </div>

              {recipientMode === "tag" && (
                <div>
                  <label htmlFor="friend-tag">Tag</label>
                  <select
                    id="friend-tag"
                    value={tag}
                    onChange={(event) => setTag(event.target.value)}
                  >
                    <option value="">Select a tag…</option>
                    {tagOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label htmlFor="friend-email-attachment">Attachments</label>
                <input
                  id="friend-email-attachment"
                  type="file"
                  onChange={handleAttachmentChange}
                  disabled={isUploadingAttachment}
                />
                {isUploadingAttachment && <span>Uploading…</span>}
              </div>
            </div>

            {attachmentError && <p role="alert">{attachmentError}</p>}
            {attachments.length > 0 && (
              <ul className="email-attachment-list">
                {attachments.map((attachment) => (
                  <li key={attachment.filename}>
                    {attachment.filename}{" "}
                    <button type="button" onClick={() => removeAttachment(attachment.filename)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {recipientMode === "custom" && (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Name</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {friendsWithEmail.map((friend) => (
                    <tr key={friend.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${friend.first_name} ${friend.last_name}`}
                          checked={selectedFriendIds.includes(friend.id)}
                          onChange={() => toggleFriend(friend.id)}
                        />
                      </td>
                      <td>
                        {friend.first_name} {friend.last_name}
                      </td>
                      <td>{friend.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

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

            <button
              type="submit"
              disabled={!canSend}
              title={!canSendEmail ? "You do not have permission to send emails" : undefined}
            >
              Review send ({recipientCount} recipient{recipientCount === 1 ? "" : "s"})
            </button>
          </form>

          {isConfirming && (
            <div className="admin-form" role="alertdialog">
              <h2>Confirm send</h2>
              <p>
                This will email <strong>{recipientCount}</strong> recipient
                {recipientCount === 1 ? "" : "s"}
                {skippedCount > 0
                  ? ` (${skippedCount} contact${skippedCount === 1 ? "" : "s"} skipped — no email on file)`
                  : ""}
                {attachments.length > 0
                  ? ` with ${attachments.length} attachment${attachments.length === 1 ? "" : "s"}`
                  : ""}
                . This cannot be undone.
              </p>
              <button type="button" onClick={handleConfirmSend} disabled={isSending}>
                {isSending ? "Sending…" : "Confirm send"}
              </button>
              <button type="button" onClick={cancelConfirm} disabled={isSending}>
                Cancel
              </button>
            </div>
          )}

          <h2>Email log</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Recipient group</th>
                <th>Recipients</th>
                <th>Status</th>
                <th>Attachments</th>
                <th>Sent at</th>
              </tr>
            </thead>
            <tbody>
              {emailLog.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.subject}</td>
                  <td>{entry.recipient_group}</td>
                  <td>{entry.recipient_count}</td>
                  <td>{entry.status}</td>
                  <td>{entry.has_attachments ? "Yes" : "No"}</td>
                  <td>{new Date(entry.sent_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
