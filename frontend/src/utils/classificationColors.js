// Story 11.4 — fixed palette, deterministic per classification name so the
// same classification always gets the same colour across cards, detail
// pages, and charts without needing a colour stored in the DB.
const PALETTE = [
  "bg-blue-100 text-blue-800",
  "bg-teal-100 text-teal-800",
  "bg-amber-100 text-amber-800",
  "bg-purple-100 text-purple-800",
  "bg-rose-100 text-rose-800",
  "bg-emerald-100 text-emerald-800",
  "bg-indigo-100 text-indigo-800",
  "bg-orange-100 text-orange-800",
];

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function classificationColorClass(name) {
  if (!name) return PALETTE[0];
  return PALETTE[hashString(name) % PALETTE.length];
}
