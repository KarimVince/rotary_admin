// WhatsApp registration invite for a dinner/meeting event. Plain text only
// (WhatsApp has no rich formatting we want to depend on), generated
// client-side from the event row so there is nothing to store or migrate.

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const SIGNUP_LINES = 10;
// Fellowship starts at the event's start_time; dinner is served 35 minutes later.
export const DINNER_OFFSET_MINUTES = 35;
export const WANCHAI_PRICE_HKD = 400;
export const DISCOVERY_BAY_PRICE_HKD = 350;

// "2026-10-20" -> "Tuesday 20 October 2026", via UTC calendar math so it
// never shifts with the browser's own timezone.
export function formatInviteDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday} ${day} ${MONTHS[month - 1]} ${year}`;
}

// 19:00 -> "7pm", 19:35 -> "7:35pm"
function formatClock(totalMinutes) {
  const minutesInDay = 24 * 60;
  const normalised = ((totalMinutes % minutesInDay) + minutesInDay) % minutesInDay;
  const hour = Math.floor(normalised / 60);
  const minute = normalised % 60;
  const hour12 = hour % 12 || 12;
  const period = hour < 12 ? "am" : "pm";
  return minute === 0 ? `${hour12}${period}` : `${hour12}:${String(minute).padStart(2, "0")}${period}`;
}

function startMinutes(timeString) {
  const [hour, minute] = timeString.split(":").map(Number);
  return hour * 60 + minute;
}

// Wanchai venue -> HKD 400, Discovery Bay venue -> HKD 350. Any other (or
// missing) location returns null so the invite never states a wrong price.
export function priceForLocation(location) {
  const text = (location || "").toLowerCase().replace(/\s+/g, "");
  if (text.includes("wanchai")) return WANCHAI_PRICE_HKD;
  if (text.includes("discoverybay") || /\bdb\b/i.test(location || "")) return DISCOVERY_BAY_PRICE_HKD;
  return null;
}

export function buildWhatsappInvite(event) {
  const lines = [];

  const speakerLine = [event.speaker_name, event.ngo_organisation_name].filter(Boolean).join(" – ");
  if (event.speaker_name) lines.push(`Speaker: ${speakerLine}`);
  else if (event.ngo_organisation_name) lines.push(`NGO: ${event.ngo_organisation_name}`);
  if (event.topics_description) lines.push(`Topic: ${event.topics_description.trim()}`);
  if (lines.length > 0) lines.push("");

  lines.push(formatInviteDate(event.event_date));

  const label = event.event_type === "Dinner" ? "Regular meeting" : event.name;
  lines.push(event.location ? `${label} at ${event.location}` : label);
  if (event.start_time) {
    const start = startMinutes(event.start_time);
    lines.push(`Fellowship from ${formatClock(start)} - Dinner ${formatClock(start + DINNER_OFFSET_MINUTES)}`);
  }

  const price = priceForLocation(event.location);
  lines.push(price === null ? "Please register" : `Please register - HKD ${price}`);

  for (let i = 1; i <= SIGNUP_LINES; i += 1) {
    if (i === 1 && event.speaker_name) lines.push(`1 - ${event.speaker_name} (speaker)`);
    else lines.push(`${i} - `);
  }

  return lines.join("\n");
}
