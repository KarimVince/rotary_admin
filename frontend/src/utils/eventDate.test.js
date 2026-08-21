import { describe, expect, it } from "vitest";
import { addDaysToDateString, formatTime12h, isBeyondAttendanceEditWindow, todayInHongKong } from "./eventDate";

describe("formatTime12h (Story 16.27)", () => {
  it("formats an evening time with no leading zero on the hour", () => {
    expect(formatTime12h("19:00")).toBe("7:00 PM");
  });

  it("formats a morning time", () => {
    expect(formatTime12h("07:05")).toBe("7:05 AM");
  });

  it("handles midnight and noon", () => {
    expect(formatTime12h("00:00")).toBe("12:00 AM");
    expect(formatTime12h("12:00")).toBe("12:00 PM");
  });

  it("accepts an HH:MM:SS string from the API", () => {
    expect(formatTime12h("21:30:00")).toBe("9:30 PM");
  });

  it("returns null for an unset time", () => {
    expect(formatTime12h(null)).toBeNull();
    expect(formatTime12h("")).toBeNull();
  });
});

describe("addDaysToDateString", () => {
  it("adds days within the same month", () => {
    expect(addDaysToDateString("2026-07-05", 1)).toBe("2026-07-06");
  });

  it("subtracts days across a month boundary", () => {
    expect(addDaysToDateString("2026-08-01", -1)).toBe("2026-07-31");
  });

  it("rolls over a year boundary", () => {
    expect(addDaysToDateString("2025-12-31", 1)).toBe("2026-01-01");
  });
});

describe("isBeyondAttendanceEditWindow (2026-08-21 — 2-day marking window)", () => {
  const today = todayInHongKong();
  const in2Days = addDaysToDateString(today, 2);
  const in3Days = addDaysToDateString(today, 3);
  const yesterday = addDaysToDateString(today, -1);

  it("is not locked for today's event", () => {
    expect(isBeyondAttendanceEditWindow(today)).toBe(false);
  });

  it("is not locked exactly 2 days out (the marking window)", () => {
    expect(isBeyondAttendanceEditWindow(in2Days)).toBe(false);
  });

  it("is locked for an event 3+ days out", () => {
    expect(isBeyondAttendanceEditWindow(in3Days)).toBe(true);
  });

  it("is not locked for a past event", () => {
    expect(isBeyondAttendanceEditWindow(yesterday)).toBe(false);
  });
});
