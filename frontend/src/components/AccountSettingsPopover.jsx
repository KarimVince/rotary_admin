import { useEffect, useRef, useState } from "react";
import { changeAccountPassword, requestAccountEmailChange } from "../api/account";

// Story 16.30 — account settings popover, opened by clicking the user's own
// avatar/name pill in the top nav (AppLayout.jsx). Self-service only: scoped
// to the `users` table's login/account fields (email + password), NOT the
// `members` club-profile data — matches the story's own explicit scope note.
// No permission-matrix gating (useAccess) — every logged-in user manages
// their own account regardless of their module-level access elsewhere.
//
// Click-outside-to-close follows the same pattern as SingleSelectDropdown.jsx
// (no shared Popover/Menu primitive exists yet in this codebase).
export default function AccountSettingsPopover({ user, children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState("email");
  const containerRef = useRef(null);

  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailError, setEmailError] = useState(null);
  const [emailSuccess, setEmailSuccess] = useState(null);
  const [isSavingEmail, setIsSavingEmail] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState(null);
  const [passwordSuccess, setPasswordSuccess] = useState(null);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    function handlePointerDown(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function resetForms() {
    setTab("email");
    setNewEmail("");
    setEmailPassword("");
    setEmailError(null);
    setEmailSuccess(null);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError(null);
    setPasswordSuccess(null);
  }

  function toggleOpen() {
    setIsOpen((open) => {
      if (open) resetForms();
      return !open;
    });
  }

  async function handleEmailSubmit(event) {
    event.preventDefault();
    setEmailError(null);
    setEmailSuccess(null);
    setIsSavingEmail(true);
    try {
      await requestAccountEmailChange(newEmail, emailPassword);
      setEmailSuccess(`Verification email sent to ${newEmail} — click the link there to confirm.`);
      setNewEmail("");
      setEmailPassword("");
    } catch (err) {
      setEmailError(err.detail || "Failed to request the email change");
    } finally {
      setIsSavingEmail(false);
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match");
      return;
    }

    setIsSavingPassword(true);
    try {
      await changeAccountPassword(currentPassword, newPassword);
      setPasswordSuccess("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordError(err.detail || "Failed to change password");
    } finally {
      setIsSavingPassword(false);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={toggleOpen}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label="Account settings"
        className="!bg-transparent !p-0 rounded-lg"
      >
        {children}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Account settings"
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-[320px] rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_12px_30px_-10px_rgba(20,27,43,.22)]"
        >
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[.1em] text-[var(--faint)]">
            Account settings
          </p>

          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={() => setTab("email")}
              className={`rounded-[7px] px-3 py-1 text-[12px] font-semibold ${
                tab === "email"
                  ? "bg-[var(--color-brand-blue)] text-white"
                  : "bg-[var(--tone-blue-bg)] text-[var(--color-brand-blue)]"
              }`}
            >
              Email
            </button>
            <button
              type="button"
              onClick={() => setTab("password")}
              className={`rounded-[7px] px-3 py-1 text-[12px] font-semibold ${
                tab === "password"
                  ? "bg-[var(--color-brand-blue)] text-white"
                  : "bg-[var(--tone-blue-bg)] text-[var(--color-brand-blue)]"
              }`}
            >
              Password
            </button>
          </div>

          {tab === "email" ? (
            <form onSubmit={handleEmailSubmit} className="flex flex-col gap-2">
              <p className="m-0 text-[12px] text-[var(--color-muted-text)]">
                Current email: <span className="font-semibold">{user?.email}</span>
              </p>
              <label htmlFor="account-new-email" className="text-[12px] font-semibold">
                New email
              </label>
              <input
                id="account-new-email"
                type="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                required
                className="rounded-[8px] border border-[var(--color-border-faint)] p-2 text-[13px]"
              />
              <label htmlFor="account-email-current-password" className="text-[12px] font-semibold">
                Current password
              </label>
              <input
                id="account-email-current-password"
                type="password"
                value={emailPassword}
                onChange={(event) => setEmailPassword(event.target.value)}
                autoComplete="current-password"
                required
                className="rounded-[8px] border border-[var(--color-border-faint)] p-2 text-[13px]"
              />
              {emailError && <p role="alert">{emailError}</p>}
              {emailSuccess && <p>{emailSuccess}</p>}
              <button
                type="submit"
                disabled={isSavingEmail}
                className="rounded-[8px] bg-[var(--color-brand-blue)] px-3 py-[6px] text-[12px] font-semibold text-white disabled:opacity-50"
              >
                {isSavingEmail ? "Sending…" : "Send verification link"}
              </button>
            </form>
          ) : (
            <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-2">
              <label htmlFor="account-current-password" className="text-[12px] font-semibold">
                Current password
              </label>
              <input
                id="account-current-password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                required
                className="rounded-[8px] border border-[var(--color-border-faint)] p-2 text-[13px]"
              />
              <label htmlFor="account-new-password" className="text-[12px] font-semibold">
                New password
              </label>
              <input
                id="account-new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                className="rounded-[8px] border border-[var(--color-border-faint)] p-2 text-[13px]"
              />
              <label htmlFor="account-confirm-password" className="text-[12px] font-semibold">
                Confirm new password
              </label>
              <input
                id="account-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                className="rounded-[8px] border border-[var(--color-border-faint)] p-2 text-[13px]"
              />
              {passwordError && <p role="alert">{passwordError}</p>}
              {passwordSuccess && <p>{passwordSuccess}</p>}
              <button
                type="submit"
                disabled={isSavingPassword}
                className="rounded-[8px] bg-[var(--color-brand-blue)] px-3 py-[6px] text-[12px] font-semibold text-white disabled:opacity-50"
              >
                {isSavingPassword ? "Saving…" : "Change password"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
