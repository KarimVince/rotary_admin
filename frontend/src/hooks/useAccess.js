import { useContext } from "react";
import { PermissionsContext } from "../context/PermissionsContext";

export function useAccess(functionKey) {
  const context = useContext(PermissionsContext);
  if (context === undefined) {
    throw new Error("useAccess must be used within a PermissionsProvider");
  }

  const level = context.permissions[functionKey] ?? "no_access";

  return {
    canRead: level === "read" || level === "write",
    canWrite: level === "write",
  };
}
