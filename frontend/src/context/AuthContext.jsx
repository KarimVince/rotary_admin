import { createContext, useCallback, useEffect, useRef, useState } from "react";
import { fetchCurrentUser, loginRequest, refreshRequest } from "../api/auth";
import { setAccessToken } from "../api/client";

// Access token lives only in memory (React state) to limit XSS exposure.
// The refresh token has to survive a page reload for the SPA to keep a
// session without cookies, so it's the one piece kept in localStorage.
const REFRESH_TOKEN_STORAGE_KEY = "rotaryadmin.refresh_token";

export const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const hasAttemptedRestoreRef = useRef(false);

  const applySession = useCallback((tokens, currentUser) => {
    setAccessToken(tokens.access_token);
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, tokens.refresh_token);
    setUser(currentUser);
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    setUser(null);
  }, []);

  const login = useCallback(
    async (email, password) => {
      const tokens = await loginRequest(email, password);
      setAccessToken(tokens.access_token);
      const currentUser = await fetchCurrentUser();
      applySession(tokens, currentUser);
      return currentUser;
    },
    [applySession],
  );

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  useEffect(() => {
    // Guard against React StrictMode's dev-only double effect invocation:
    // the refresh token is single-use, so two concurrent restore attempts
    // would race and the loser would wipe out the winner's new session.
    if (hasAttemptedRestoreRef.current) {
      return;
    }
    hasAttemptedRestoreRef.current = true;

    async function restoreSession() {
      const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
      if (!storedRefreshToken) {
        setIsLoading(false);
        return;
      }

      try {
        const tokens = await refreshRequest(storedRefreshToken);
        setAccessToken(tokens.access_token);
        const currentUser = await fetchCurrentUser();
        applySession(tokens, currentUser);
      } catch {
        clearSession();
      } finally {
        setIsLoading(false);
      }
    }

    restoreSession();
  }, [applySession, clearSession]);

  const value = {
    user,
    isAuthenticated: Boolean(user),
    isLoading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
