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
