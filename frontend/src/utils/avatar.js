export function getInitials(firstName, lastName) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();
}

// A small cycling pastel palette for per-person avatars, shared by the
// Dashboard board-member cards and the email recipient picker.
export const AVATAR_TONES = [
  { bgClass: "bg-[var(--tone-blue-bg)]", textClass: "text-[var(--color-brand-blue)]" },
  { bgClass: "bg-[var(--tone-lavender-bg)]", textClass: "text-[#5b3fa0]" },
  { bgClass: "bg-[var(--tone-teal-bg)]", textClass: "text-[#1a7a68]" },
  { bgClass: "bg-[var(--tone-amber-bg)]", textClass: "text-[#b8760f]" },
];
