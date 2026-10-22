import { describe, expect, it } from "vitest";
import { buildWhatsappInvite, formatInviteDate, priceForLocation } from "./whatsappInvite";

const EVENT = {
  name: "Regular Dinner",
  event_type: "Dinner",
  event_date: "2026-10-20",
  location: "Tangram - AKI Hotel Wanchai",
  start_time: "19:00:00",
  speaker_name: "Chris Masset",
  ngo_organisation_name: "Helping Hands",
  topics_description: "Clean water in rural schools",
};

describe("formatInviteDate", () => {
  it("formats weekday, day, month name and year", () => {
    expect(formatInviteDate("2026-10-20")).toBe("Tuesday 20 October 2026");
  });
});

describe("priceForLocation", () => {
  it("returns 400 for Wanchai and 350 for Discovery Bay", () => {
    expect(priceForLocation("Tangram - AKI Hotel Wanchai")).toBe(400);
    expect(priceForLocation("Wan Chai Venue")).toBe(400);
    expect(priceForLocation("Discovery Bay Clubhouse")).toBe(350);
    expect(priceForLocation("DB Plaza")).toBe(350);
  });

  it("returns null for an unknown or missing location", () => {
    expect(priceForLocation("Somewhere Else")).toBeNull();
    expect(priceForLocation(null)).toBeNull();
  });
});

describe("buildWhatsappInvite", () => {
  const lines = buildWhatsappInvite(EVENT).split("\n");

  it("puts speaker, NGO and topic on top", () => {
    expect(lines[0]).toBe("Speaker: Chris Masset – Helping Hands");
    expect(lines[1]).toBe("Topic: Clean water in rural schools");
  });

  it("includes date, regular meeting label, location and times", () => {
    expect(lines).toContain("Tuesday 20 October 2026");
    expect(lines).toContain(
      "Regular meeting at Tangram - AKI Hotel Wanchai – Fellowship from 7pm Dinner 7:35pm",
    );
  });

  it("asks to register with the Wanchai price", () => {
    expect(lines).toContain("Please register - HKD 400");
  });

  it("starts the list with the speaker and numbers up to 10", () => {
    expect(lines).toContain("1 - Chris Masset (speaker)");
    expect(lines).toContain("2 - ");
    expect(lines[lines.length - 1]).toBe("10 - ");
    expect(lines.filter((l) => /^\d+ - /.test(l))).toHaveLength(10);
  });

  it("uses 350 for a Discovery Bay venue", () => {
    const text = buildWhatsappInvite({ ...EVENT, location: "Discovery Bay Clubhouse" });
    expect(text).toContain("Please register - HKD 350");
  });

  it("omits optional parts and leaves line 1 empty when there is no speaker or time", () => {
    const text = buildWhatsappInvite({
      ...EVENT,
      speaker_name: null,
      ngo_organisation_name: null,
      topics_description: null,
      start_time: null,
    });
    const out = text.split("\n");
    expect(out[0]).toBe("Tuesday 20 October 2026");
    expect(out[1]).toBe("Regular meeting at Tangram - AKI Hotel Wanchai");
    expect(out).toContain("1 - ");
  });

  it("omits the price when the location is unrecognised", () => {
    const text = buildWhatsappInvite({ ...EVENT, location: "Elsewhere" });
    expect(text).toContain("\nPlease register\n");
  });
});
