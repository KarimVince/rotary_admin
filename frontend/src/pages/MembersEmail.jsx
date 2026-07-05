import { useEffect, useMemo, useState } from "react";
import { listEmailLog, sendMemberEmail, uploadEmailAttachment } from "../api/memberEmail";
import { listMembers } from "../api/members";

const GROUP_LABELS = {
  all: "All members",
  active: "Active members",
  past: "Past members",
};

export default function MembersEmail() {
  const [members, setMembers] = useState([]);
  const [emailLog, setEmailLog] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipientMode, setRecipientMode] = useState("group");
  const [recipientGroup, setRecipientGroup] = useState("active");
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
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
      const [membersData, logData] = await Promise.all([listMembers({}), listEmailLog()]);
      setMembers(membersData);
      setEmailLog(logData);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.detail || "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const membersWithEmail = useMemo(() => members.filter((member) => member.email), [members]);

  const previewCount = useMemo(() => {
    if (recipientMode === "custom") {
      return selectedMemberIds.length;
    }
    if (recipientGroup === "all") {
      return membersWithEmail.length;
    }
    return membersWithEmail.filter((member) => member.status === recipientGroup).length;
  }, [recipientMode, recipientGroup, selectedMemberIds, membersWithEmail]);

  function toggleMember(memberId) {
    setSelectedMemberIds((current) =>
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId],
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
        payload.member_ids = selectedMemberIds;
      } else {
        payload.recipient_group = recipientGroup;
      }
      if (attachments.length > 0) {
        payload.attachments = attachments;
      }
      const result = await sendMemberEmail(payload);
      setLastResult(result);
      setIsConfirming(false);
      setSubject("");
      setBody("");
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

  return (
    <div className="admin-page">
      <h1>Email members</h1>

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && (
        <>
          <form className="admin-form email-compose-form" onSubmit={handleReview}>
            <h2>Compose</h2>

            <label htmlFor="email-subject">Subject</label>
            <input
              id="email-subject"
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              required
            />

            <label htmlFor="email-body">Body</label>
            <textarea
              id="email-body"
              className="email-body-textarea"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              required
            />

            <div className="email-controls-row">
              <div>
                <label htmlFor="recipient-mode">Send to</label>
                <select
                  id="recipient-mode"
                  value={recipientMode}
                  onChange={(event) => setRecipientMode(event.target.value)}
                >
                  <option value="group">A group</option>
                  <option value="custom">Custom selection</option>
                </select>
              </div>

              {recipientMode === "group" && (
                <div>
                  <label htmlFor="recipient-group">Group</label>
                  <select
                    id="recipient-group"
                    value={recipientGroup}
                    onChange={(event) => setRecipientGroup(event.target.value)}
                  >
                    <option value="all">All members</option>
                    <option value="active">Active members</option>
                    <option value="past">Past members</option>
                  </select>
                </div>
              )}

              <div>
                <label htmlFor="email-attachment">Attachments</label>
                <input
                  id="email-attachment"
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
                  {membersWithEmail.map((member) => (
                    <tr key={member.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${member.first_name} ${member.last_name}`}
                          checked={selectedMemberIds.includes(member.id)}
                          onChange={() => toggleMember(member.id)}
                        />
                      </td>
                      <td>
                        {member.first_name} {member.last_name}
                      </td>
                      <td>{member.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {sendError && <p role="alert">{sendError}</p>}
            {lastResult && (
              <p>
                Last send: {lastResult.status} — {lastResult.success_count} succeeded,{" "}
                {lastResult.failure_count} failed (of {lastResult.recipient_count}).
              </p>
            )}

            <button type="submit" disabled={previewCount === 0}>
              Review send ({previewCount} recipient{previewCount === 1 ? "" : "s"})
            </button>
          </form>

          {isConfirming && (
            <div className="admin-form" role="alertdialog">
              <h2>Confirm send</h2>
              <p>
                This will email <strong>{previewCount}</strong> recipient
                {previewCount === 1 ? "" : "s"}
                {recipientMode === "group" ? ` (${GROUP_LABELS[recipientGroup]})` : ""}
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
