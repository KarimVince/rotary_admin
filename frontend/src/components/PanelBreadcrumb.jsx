import { useTheme } from "../context/ThemeContext";

// Story 14.13: shown atop an open Manage Project panel — "← [Event] ·
// Manage Project" — clicking it clears the ?panel= query param, returning
// to the bento overview with the same event still selected. Minimal shows
// "← All panels / <Panel name>" instead (per the redesign reference),
// which needs the current panel's display label from the caller.
export default function PanelBreadcrumb({ event, panelLabel, onBack }) {
  const { isMinimal } = useTheme();

  if (isMinimal) {
    return (
      <div className="mb-4 flex items-center gap-2 text-[13px]">
        <button
          type="button"
          onClick={onBack}
          className="bg-transparent p-0 font-semibold text-[var(--accent)] hover:text-[var(--accent-ink)]"
        >
          ← All panels
        </button>
        <span className="text-[var(--border)]">/</span>
        <span className="font-semibold text-[var(--ink-2)]">{panelLabel}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onBack}
      className="mb-4 bg-transparent p-0 text-[13px] font-semibold text-[var(--color-brand-blue)]"
    >
      ← {event?.name} · Manage Project
    </button>
  );
}
