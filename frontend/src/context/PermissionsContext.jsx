import { createContext, useCallback, useEffect, useState } from "react";
import { fetchMyPermissions } from "../api/boardPermissions";
import { useAuth } from "../hooks/useAuth";

export const PermissionsContext = createContext(undefined);

export function PermissionsProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [permissions, setPermissions] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  const loadPermissions = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchMyPermissions();
      setPermissions(data);
    } catch {
      // A load failure leaves permissions empty, i.e. no_access everywhere —
      // fails closed rather than granting access on error.
      setPermissions({});
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadPermissions();
    } else {
      setPermissions({});
    }
  }, [isAuthenticated, loadPermissions]);

  const value = { permissions, isLoading, refreshPermissions: loadPermissions };

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}
