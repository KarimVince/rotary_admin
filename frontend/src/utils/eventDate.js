// Story 16.9 — "future" is judged against today's date in Hong Kong time
// (not the browser's local timezone), so an event dated today stays
// "active" for attendance purposes until midnight HKT, not midnight
// wherever the viewer happens to be.
export function todayInHongKong() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" });
}

// event_date is a plain "YYYY-MM-DD" string — lexicographic comparison
// against another "YYYY-MM-DD" string is equivalent to date comparison.
export function isFutureEventDate(eventDate) {
  return eventDate > todayInHongKong();
}

// "YYYY-MM-DD" + N days -> "YYYY-MM-DD", via UTC calendar math so it never
// drifts across a DST boundary (Hong Kong has none, but this stays correct
// regardless of the browser's own timezone since the input/output are both
// plain calendar strings, never a wall-clock Date).
export function addDaysToDateString(dateStr, days) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// 2026-08-21: marking who attended (selecting guests present) can now start
// 2 days ahead of the event, not just the day before — generating/printing
// the sheet itself (Story 16.33) was never date-gated and stays available
// any time, arbitrarily far in advance; only the present/paid *marking* is
// gated by this window. Deliberately a separate helper from
// `isFutureEventDate` above: that one still governs *display* semantics
// (the "Not started" chip, month attendance averages) which should stay
// tied to the event's actual date, not this earlier marking window.
export function isBeyondAttendanceEditWindow(eventDate) {
  return eventDate > addDaysToDateString(todayInHongKong(), 2);
}

// Story 16.27 — "HH:MM(:SS)" (as returned by the API) -> "7:00 PM", no
// leading zero on the hour. Mirrors backend/app/core/dinner_forecast_report.py's
// _format_time_12h so the PDF report and every UI surface read identically.
export function formatTime12h(timeString) {
  if (!timeString) return null;
  const [hourStr, minuteStr] = timeString.split(":");
  const hour = Number(hourStr);
  const hour12 = hour % 12 || 12;
  const period = hour < 12 ? "AM" : "PM";
  return `${hour12}:${minuteStr} ${period}`;
}
