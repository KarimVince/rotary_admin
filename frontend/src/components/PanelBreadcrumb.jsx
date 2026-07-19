// Story 14.13: shown atop an open Manage Project panel — "← [Event] ·
// Manage Project" — clicking it clears the ?panel= query param, returning
// to the bento overview with the same event still selected.
export default function PanelBreadcrumb({ event, onBack }) {
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
