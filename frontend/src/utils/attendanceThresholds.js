// Story 10.9 — colour-coding thresholds for per-event attendance %, kept as
// named constants rather than magic numbers inline in the component.
export const ATTENDANCE_GREEN_MIN = 70;
export const ATTENDANCE_AMBER_MIN = 50;

export function attendanceColorClass(percentage) {
  if (percentage >= ATTENDANCE_GREEN_MIN) return "text-green-700 bg-green-100";
  if (percentage >= ATTENDANCE_AMBER_MIN) return "text-amber-700 bg-amber-100";
  return "text-red-700 bg-red-100";
}
