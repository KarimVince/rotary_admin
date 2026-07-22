import { describe, expect, it } from "vitest";
import { buildIcsCalendar, slugify } from "./ics";

const EVENT = {
  id: "event-1",
  name: "Welcome Dinner",
  event_date: "2026-07-05",
  location: "Club House",
  ngo_organisation_name: "Helping Hands",
  speaker_name: "Jane Speaker",
  topics_description: "Annual kickoff",
};

describe("buildIcsCalendar", () => {
  it("wraps events in a valid VCALENDAR with one VEVENT per event", () => {
    const ics = buildIcsCalendar([EVENT]);

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain("UID:event-1@rotaryadmin.app");
    expect(ics).toContain("SUMMARY:Welcome Dinner");
  });

  it("uses an all-day DTSTART/DTEND with DTEND as the exclusive next day", () => {
    const ics = buildIcsCalendar([EVENT]);

    expect(ics).toContain("DTSTART;VALUE=DATE:20260705");
    expect(ics).toContain("DTEND;VALUE=DATE:20260706");
  });

  it("rolls DTEND over a month boundary", () => {
    const ics = buildIcsCalendar([{ ...EVENT, event_date: "2026-07-31" }]);

    expect(ics).toContain("DTSTART;VALUE=DATE:20260731");
    expect(ics).toContain("DTEND;VALUE=DATE:20260801");
  });

  it("includes location (org name appended) and description (speaker + topics)", () => {
    const ics = buildIcsCalendar([EVENT]);

    expect(ics).toContain("LOCATION:Club House\\, Helping Hands");
    expect(ics).toContain("DESCRIPTION:Speaker: Jane Speaker\\nAnnual kickoff");
  });

  it("omits LOCATION/DESCRIPTION when the underlying fields are absent", () => {
    const ics = buildIcsCalendar([
      { id: "event-2", name: "Bare Event", event_date: "2026-08-01" },
    ]);

    expect(ics).not.toContain("LOCATION:");
    expect(ics).not.toContain("DESCRIPTION:");
  });

  it("escapes commas, semicolons, and backslashes in text fields", () => {
    const ics = buildIcsCalendar([
      { ...EVENT, name: "Gala; Fundraiser, Night\\Special" },
    ]);

    expect(ics).toContain("SUMMARY:Gala\\; Fundraiser\\, Night\\\\Special");
  });

  it("produces one VEVENT block per event for a multi-event calendar", () => {
    const ics = buildIcsCalendar([
      EVENT,
      { ...EVENT, id: "event-2", name: "Second Dinner", event_date: "2026-07-12" },
    ]);

    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("SUMMARY:Second Dinner");
  });
});

describe("buildIcsCalendar with start/end time (Story 16.27)", () => {
  it("uses a timed DTSTART/DTEND (Asia/Hong_Kong) when start_time and end_time are both set", () => {
    const ics = buildIcsCalendar([{ ...EVENT, start_time: "19:00", end_time: "21:30" }]);

    expect(ics).toContain("DTSTART;TZID=Asia/Hong_Kong:20260705T190000");
    expect(ics).toContain("DTEND;TZID=Asia/Hong_Kong:20260705T213000");
    expect(ics).not.toContain("VALUE=DATE");
  });

  it("defaults to a 2-hour duration when only start_time is set", () => {
    const ics = buildIcsCalendar([{ ...EVENT, start_time: "19:00" }]);

    expect(ics).toContain("DTSTART;TZID=Asia/Hong_Kong:20260705T190000");
    expect(ics).toContain("DTEND;TZID=Asia/Hong_Kong:20260705T210000");
  });

  it("accepts an HH:MM:SS time string from the API", () => {
    const ics = buildIcsCalendar([{ ...EVENT, start_time: "19:00:00", end_time: "21:30:00" }]);

    expect(ics).toContain("DTSTART;TZID=Asia/Hong_Kong:20260705T190000");
    expect(ics).toContain("DTEND;TZID=Asia/Hong_Kong:20260705T213000");
  });

  it("falls back to an all-day event when no start_time is set", () => {
    const ics = buildIcsCalendar([EVENT]);

    expect(ics).toContain("DTSTART;VALUE=DATE:20260705");
    expect(ics).not.toContain("TZID=Asia/Hong_Kong");
  });
});

describe("slugify", () => {
  it("lowercases, strips punctuation, and hyphen-joins words", () => {
    expect(slugify("Welcome Dinner!")).toBe("welcome-dinner");
    expect(slugify("July 2026")).toBe("july-2026");
    expect(slugify("  Leading/Trailing  ")).toBe("leading-trailing");
  });
});
