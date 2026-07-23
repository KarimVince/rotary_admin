import { useEffect, useRef } from "react";

// Refetches when the user comes back to this tab/window. Finance's
// computed pages (Summary/Fund Raising/Operational Tracking) pull in
// figures from other modules (Event costs, Event fundraising) that this
// page has no other way to know changed — plain fetch-on-mount only
// updates on a fresh navigation, not when the same tab was just left open
// while the user edited data elsewhere.
export function useWindowFocusRefetch(callback, enabled = true) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;
    function handleFocusOrVisible() {
      if (document.visibilityState === "hidden") return;
      callbackRef.current();
    }
    window.addEventListener("focus", handleFocusOrVisible);
    document.addEventListener("visibilitychange", handleFocusOrVisible);
    return () => {
      window.removeEventListener("focus", handleFocusOrVisible);
      document.removeEventListener("visibilitychange", handleFocusOrVisible);
    };
  }, [enabled]);
}
