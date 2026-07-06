// Mirrors backend app/core/rotary_year.py: the rotary year runs 1 July →
// 30 June and is labelled by its starting calendar year.
export function rotaryYear(dateString) {
  if (!dateString) return null;
  const [year, month] = dateString.split("-").map(Number);
  if (!year || !month) return null;
  return month >= 7 ? year : year - 1;
}

export function rotaryYearLabel(year) {
  if (year === null || year === undefined) return "";
  return `${year}–${year + 1}`;
}

export function currentRotaryYear() {
  const now = new Date();
  const month = now.getMonth() + 1;
  return month >= 7 ? now.getFullYear() : now.getFullYear() - 1;
}
