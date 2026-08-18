import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { confirmAccountEmailChange } from "../api/account";
import BrandHeader from "../components/BrandHeader";

// Story 16.30 — confirms a pending self-service email change. Deliberately
// requires a manual button click rather than auto-confirming on page load:
// some email clients/security scanners pre-fetch links in an email body,
// which would silently burn the single-use token before the user ever
// clicks it.
export default function ConfirmEmailChange() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  async function handleConfirm() {
    setError(null);
    setIsSubmitting(true);
    try {
      await confirmAccountEmailChange(token);
      setIsDone(true);
    } catch (err) {
      setError(err.detail || "Failed to confirm — the link may be invalid or expired");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-form">
        <BrandHeader size="large" />
        <h2>Confirm your new email</h2>

        {!token && <p role="alert">This confirmation link is missing its token.</p>}

        {isDone ? (
          <>
            <p>Your account email has been updated.</p>
            <Link to="/login">Back to login</Link>
          </>
        ) : (
          <>
            <p>Click below to confirm this as your new Rotary Admin login email.</p>
            {error && (
              <p role="alert" className="login-error">
                {error}
              </p>
            )}
            <button type="button" onClick={handleConfirm} disabled={isSubmitting || !token}>
              {isSubmitting ? "Confirming…" : "Confirm new email"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
