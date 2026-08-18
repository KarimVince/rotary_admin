import { useState } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "../api/auth";
import BrandHeader from "../components/BrandHeader";

// Story 16.30 — self-service "Forgot password?" request page. Always shows
// the same generic success message regardless of whether the email is
// registered (matches the backend's anti-enumeration response, per the
// story's own AC: "email not found" should not reveal account existence).
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await requestPasswordReset(email);
      setIsDone(true);
    } catch (err) {
      // A network/server error is still surfaced — only account existence
      // is hidden, not genuine failures.
      setError(err.detail || "Something went wrong — please try again");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-form" onSubmit={handleSubmit}>
        <BrandHeader size="large" />
        <h2>Reset your password</h2>

        {isDone ? (
          <>
            <p>If that email is registered, we've sent a password reset link to it.</p>
            <Link to="/login">Back to login</Link>
          </>
        ) : (
          <>
            <label htmlFor="forgot-email">Email</label>
            <input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
            />
            {error && (
              <p role="alert" className="login-error">
                {error}
              </p>
            )}
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Sending…" : "Send reset link"}
            </button>
            <Link to="/login" className="login-forgot-link">
              Back to login
            </Link>
          </>
        )}
      </form>
    </div>
  );
}
