// Shared display formatters for the Events module — "HKD xxx,xxx" for money
// (thousand-separated, no decimals) and "dd mmm yyyy" for dates. Parses the
// date string manually rather than via `new Date()` to avoid timezone shifts
// on plain YYYY-MM-DD values (event.date, payment_deadline, etc.).
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatCurrency(value) {
  if (value === null || value === undefined) return "—";
  return `HKD ${Math.round(value).toLocaleString()}`;
}

export function formatDate(dateString) {
  if (!dateString) return "—";
  const [year, month, day] = dateString.split("-").map(Number);
  if (!year || !month || !day) return dateString;
  return `${String(day).padStart(2, "0")} ${MONTH_NAMES[month - 1]} ${year}`;
}
