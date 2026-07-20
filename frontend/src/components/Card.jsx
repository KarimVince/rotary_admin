const VARIANT_CLASSES = {
  default: "bg-white border border-[var(--color-card-border)] shadow-[var(--shadow-card)] rounded-xl p-4",
  elevated:
    "bg-white shadow-[var(--shadow-card)] rounded-2xl p-5 hover:-translate-y-0.5 transition-transform",
  // Dashboard's module-link and board-member cards — white with the
  // redesign's card shadow, matching the 1b mockup.
  "module-link":
    "bg-white shadow-[var(--shadow-card-lg)] rounded-2xl p-5 hover:-translate-y-0.5 transition-transform",
  hero: "bg-[var(--color-brand-blue-light)] rounded-2xl p-8",
  // Redesign: individual stat cards, one per figure, cycled across a
  // pastel palette (mirrors the existing --tone-*-bg tokens already used by
  // the Statistics pages) instead of one flat hero block for every number.
  "stat-blue": "bg-[var(--tone-blue-bg)] shadow-[var(--shadow-card)] rounded-2xl p-5",
  "stat-lavender": "bg-[var(--tone-lavender-bg)] shadow-[var(--shadow-card)] rounded-2xl p-5",
  "stat-teal": "bg-[var(--tone-teal-bg)] shadow-[var(--shadow-card)] rounded-2xl p-5",
  "stat-amber": "bg-[var(--tone-amber-bg)] shadow-[var(--shadow-card)] rounded-2xl p-5",
  "stat-rose": "bg-[var(--tone-rose-bg)] shadow-[var(--shadow-card)] rounded-2xl p-5",
  "stat-green": "bg-[var(--tone-green-bg)] shadow-[var(--shadow-card)] rounded-2xl p-5",
};

export default function Card({ variant = "default", className = "", children, ...props }) {
  const variantClass = VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.default;
  return (
    <div className={`${variantClass} ${className}`.trim()} data-variant={variant} {...props}>
      {children}
    </div>
  );
}
