// Story 16.25 — minimal client-side iCalendar (RFC 5545) serialiser for the
// Dinner & Events "Add to Calendar" buttons. Deliberately hand-rolled rather
// than pulling in a library: every event here is a single all-day date with
// no recurrence, so the format needed is a handful of fixed VEVENT fields.

function escapeIcsText(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function toIcsDate(dateString) {
  return dateString.replaceAll("-", "");
}

// DTEND for an all-day VEVENT is exclusive (RFC 5545) — the day after
// event_date, not event_date itself.
function nextDayIcsDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function nowStamp() {
  return `${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

// Story 16.27 — "HH:MM" or "HH:MM:SS" -> "HHMMSS" for a timed DTSTART/DTEND.
function toIcsTime(timeString) {
  const [hour, minute, second = "00"] = timeString.split(":");
  return `${hour.padStart(2, "0")}${minute.padStart(2, "0")}${second.padStart(2, "0")}`;
}

// A dinner with a start but no end time gets a 2-hour default duration
// (typical dinner length) rather than a zero-length event.
function defaultEndTime(startTime) {
  const [hourStr, minuteStr] = startTime.split(":");
  const totalMinutes = (Number(hourStr) * 60 + Number(minuteStr) + 2 * 60) % (24 * 60);
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function eventToVevent(event) {
  const location = [event.location, event.ngo_organisation_name].filter(Boolean).join(", ");
  const descriptionParts = [];
  if (event.speaker_name) descriptionParts.push(`Speaker: ${event.speaker_name}`);
  if (event.topics_description) descriptionParts.push(event.topics_description);

  const lines = ["BEGIN:VEVENT", `UID:${event.id}@rotaryadmin.app`, `DTSTAMP:${nowStamp()}`];

  // Story 16.27: a timed event uses the club's own timezone (Asia/Hong_Kong)
  // rather than UTC or a floating local time — falls back to the existing
  // all-day format when no start_time is set.
  if (event.start_time) {
    const endTime = event.end_time || defaultEndTime(event.start_time);
    lines.push(
      `DTSTART;TZID=Asia/Hong_Kong:${toIcsDate(event.event_date)}T${toIcsTime(event.start_time)}`,
      `DTEND;TZID=Asia/Hong_Kong:${toIcsDate(event.event_date)}T${toIcsTime(endTime)}`,
    );
  } else {
    lines.push(
      `DTSTART;VALUE=DATE:${toIcsDate(event.event_date)}`,
      `DTEND;VALUE=DATE:${nextDayIcsDate(event.event_date)}`,
    );
  }

  lines.push(`SUMMARY:${escapeIcsText(event.name)}`);
  if (location) lines.push(`LOCATION:${escapeIcsText(location)}`);
  if (descriptionParts.length > 0) {
    lines.push(`DESCRIPTION:${escapeIcsText(descriptionParts.join("\n"))}`);
  }
  lines.push("END:VEVENT");
  return lines;
}

export function buildIcsCalendar(events) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Rotary Admin//Dinner Events//EN",
    "CALSCALE:GREGORIAN",
    ...events.flatMap(eventToVevent),
    "END:VCALENDAR",
  ].join("\r\n");
}

// Slugifies free text for use inside an .ics filename — lowercase,
// alphanumerics only, hyphen-joined, no leading/trailing hyphens.
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function downloadIcs(filename, events) {
  if (!events || events.length === 0) return;
  const blob = new Blob([buildIcsCalendar(events)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
