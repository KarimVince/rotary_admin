import { describe, expect, it } from "vitest";
import { formatTime12h } from "./eventDate";

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
