import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { confirmPasswordReset } from "../api/auth";
import BrandHeader from "../components/BrandHeader";

export default function ResetPasswordConfirm() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsSubmitting(true);
    try {
      await confirmPasswordReset(token, newPassword);
      setIsDone(true);
    } catch (err) {
      setError(err.detail || "Failed to reset password — the link may be invalid or expired");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-form" onSubmit={handleSubmit}>
        <BrandHeader size="large" />
        <h2>Reset your password</h2>

        {!token && <p role="alert">This reset link is missing its token.</p>}

        {isDone ? (
          <>
            <p>Your password has been updated.</p>
            <Link to="/login">Back to login</Link>
          </>
        ) : (
          <>
            <label htmlFor="new-password">New password</label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
            <label htmlFor="confirm-password">Confirm new password</label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
            {error && (
              <p role="alert" className="login-error">
                {error}
              </p>
            )}
            <button type="submit" disabled={isSubmitting || !token}>
              {isSubmitting ? "Resetting…" : "Reset password"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
