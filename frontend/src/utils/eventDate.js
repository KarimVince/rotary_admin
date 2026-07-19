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
