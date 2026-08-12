// Story 14.13: shown atop an open Manage Project panel — "← All panels /
// <Panel name>" — clicking it clears the ?panel= query param, returning to
// the bento overview with the same event still selected.
export default function PanelBreadcrumb({ panelLabel, onBack }) {
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
