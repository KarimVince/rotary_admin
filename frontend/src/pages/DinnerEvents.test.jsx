import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import DinnerEvents from "./DinnerEvents";

const API_BASE_URL = "http://localhost:8000/api/v1";

let mockCanRead = true;
let mockCanWrite = true;
vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: mockCanRead, canWrite: mockCanWrite }),
}));

// Past-dated (relative to today) so these exercise ordinary attendance
// display — Story 16.9 has its own dedicated future-dated fixture below.
const NOT_STARTED_EVENT = {
  id: "event-1",
  name: "Welcome Dinner",
  event_date: "2026-07-05",
  event_type: "Dinner",
  rotary_year: 2026,
  location: "Club House",
  speaker_name: "Jane Speaker",
  ngo_organisation_name: null,
  speaker_rotary_contact_member_id: null,
  topics_description: null,
  member_only: false,
  created_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  attendance_started: false,
  present_count: null,
  eligible_total: null,
  attendance_percentage: null,
};

const STARTED_EVENT = {
  ...NOT_STARTED_EVENT,
  id: "event-2",
  name: "Fellowship Night",
  event_type: "Fellowship",
  attendance_started: true,
  present_count: 8,
  eligible_total: 10,
  attendance_percentage: 80,
};

// Story 16.9: dated after today — attendance_started is true (someone
// already opened the sheet and saved marks) but the UI must still read as
// "Not started" since the event hasn't happened yet.
const FUTURE_STARTED_EVENT = {
  ...NOT_STARTED_EVENT,
  id: "event-3",
  name: "Future Fellowship",
  event_date: "2027-03-15",
  attendance_started: true,
  present_count: 3,
  eligible_total: 10,
  attendance_percentage: 30,
};

const DINNER_EVENT_TYPES = [
  { id: "type-1", name: "Dinner", color_bg: "#e3edfb", color_text: "#17458f", sort_order: 0 },
  { id: "type-2", name: "Fellowship", color_bg: "#ece7fb", color_text: "#5b3fa0", sort_order: 1 },
];

const STATS = {
  rotary_year: 2026,
  total_events: 2,
  average_attendance: 8,
  average_attendance_percentage: 80,
  eligible_member_count: 10,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/dinners"]}>
      <Routes>
        <Route path="/dinners" element={<DinnerEvents />} />
        <Route path="/dinners/:eventId" element={<div>Attendance sheet page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
}

describe("DinnerEvents", () => {
  beforeEach(() => {
    mockCanRead = true;
    mockCanWrite = true;
    server.use(
      http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/dinner-forecast/events`, () =>
        HttpResponse.json([NOT_STARTED_EVENT, STARTED_EVENT]),
      ),
      http.get(`${API_BASE_URL}/attendance/stats`, () => HttpResponse.json(STATS)),
      http.get(`${API_BASE_URL}/dinner-event-types`, () => HttpResponse.json(DINNER_EVENT_TYPES)),
    );
  });

  it("renders type chips with colors from the admin-configured event types", async () => {
    renderPage();
    await waitForLoaded();

    const chips = await screen.findAllByText("Dinner");
    const chip = chips.find((el) => el.tagName === "SPAN");
    expect(chip).toHaveStyle({ backgroundColor: "#e3edfb", color: "#17458f" });
  });

  it("falls back to a neutral grey chip for an unconfigured type", async () => {
    server.use(
      http.get(`${API_BASE_URL}/dinner-forecast/events`, () =>
        HttpResponse.json([{ ...NOT_STARTED_EVENT, event_type: "Gala" }]),
      ),
    );
    renderPage();
    await waitForLoaded();

    const chip = await screen.findByText("Gala");
    expect(chip.className).toMatch(/bg-\[#f0f2f6\]/);
  });

  it("shows the NGO/Organisation name next to the speaker when set", async () => {
    server.use(
      http.get(`${API_BASE_URL}/dinner-forecast/events`, () =>
        HttpResponse.json([{ ...NOT_STARTED_EVENT, ngo_organisation_name: "Helping Hands" }]),
      ),
    );
    renderPage();
    await waitForLoaded();

    expect(await screen.findAllByText("Jane Speaker")).not.toHaveLength(0);
    expect(screen.getByText("Helping Hands")).toBeInTheDocument();
  });

  it("omits the NGO line when no NGO/Organisation is set", async () => {
    server.use(
      http.get(`${API_BASE_URL}/dinner-forecast/events`, () =>
        HttpResponse.json([NOT_STARTED_EVENT]),
      ),
    );
    renderPage();
    await waitForLoaded();

    await screen.findByText("Jane Speaker");
    expect(screen.queryByText(/^NGO:$/)).not.toBeInTheDocument();
  });

  it("populates the event-type filter pills from the admin-configured list", async () => {
    renderPage();
    await waitForLoaded();

    const group = screen.getByRole("group", { name: /event filter/i });
    const pillLabels = within(group)
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(pillLabels).toEqual(["All", "Dinner", "Fellowship"]);
  });

  it("allows selecting multiple event types for the report filter", async () => {
    let requestUrl;
    server.use(
      http.get(`${API_BASE_URL}/dinner-forecast/report`, ({ request }) => {
        requestUrl = new URL(request.url);
        return new HttpResponse("fake-pdf-bytes", {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": 'attachment; filename="dinner-forecast.pdf"',
          },
        });
      }),
    );
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:mock-url");
    URL.revokeObjectURL = vi.fn();

    renderPage();
    await waitForLoaded();

    const group = screen.getByRole("group", { name: /event filter/i });
    await userEvent.click(within(group).getByRole("button", { name: "Dinner" }));
    await userEvent.click(within(group).getByRole("button", { name: "Fellowship" }));
    await userEvent.click(screen.getByRole("button", { name: /generate report/i }));

    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    expect(requestUrl.searchParams.getAll("event_type")).toEqual(["Dinner", "Fellowship"]);

    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it("denies access without attendance.forecast read", async () => {
    mockCanRead = false;
    mockCanWrite = false;
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(/do not have permission/i);
  });

  it("shows stat cards computed from attendance stats", async () => {
    renderPage();
    await waitForLoaded();

    expect(await screen.findByText(/total events/i)).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("shows a Not started chip and Take attendance action for an unstarted event", async () => {
    renderPage();
    await waitForLoaded();

    expect(await screen.findByText("Not started")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /take attendance/i })).toBeInTheDocument();
  });

  it("shows an attendance percentage chip and View sheet action for a started event", async () => {
    renderPage();
    await waitForLoaded();

    expect(await screen.findByText("8/10 · 80%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /view sheet/i })).toBeInTheDocument();
  });

  it("starts attendance then navigates to the sheet when taking attendance", async () => {
    let startCalled = false;
    server.use(
      http.post(`${API_BASE_URL}/attendance/events/event-1/start`, () => {
        startCalled = true;
        return HttpResponse.json({ ...NOT_STARTED_EVENT, attendance_started: true });
      }),
    );

    renderPage();
    await waitForLoaded();

    await userEvent.click(await screen.findByRole("button", { name: /take attendance/i }));
    await waitFor(() => expect(startCalled).toBe(true));
    expect(await screen.findByText("Attendance sheet page")).toBeInTheDocument();
  });

  it("navigates straight to the sheet when viewing an already-started event", async () => {
    renderPage();
    await waitForLoaded();

    await userEvent.click(await screen.findByRole("button", { name: /view sheet/i }));
    expect(await screen.findByText("Attendance sheet page")).toBeInTheDocument();
  });

  it("deletes an event after confirmation", async () => {
    let deleteCalled = false;
    server.use(
      http.delete(`${API_BASE_URL}/dinner-forecast/events/event-1`, () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderPage();
    await waitForLoaded();

    const row = (await screen.findByText("Welcome Dinner")).closest("div.grid");
    await userEvent.click(
      Array.from(row.querySelectorAll("button")).find((b) => b.textContent === "Delete"),
    );
    await waitFor(() => expect(deleteCalled).toBe(true));

    window.confirm.mockRestore();
  });

  it("hides write actions for a read-only user", async () => {
    mockCanWrite = false;
    renderPage();
    await waitForLoaded();

    expect(screen.queryByText("New Dinner Event")).not.toBeInTheDocument();
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
  });

  describe("monthly attendance averages (Story 16.18)", () => {
    it("shows the average attendance count and % for the month, from completed events only", async () => {
      renderPage();
      await waitForLoaded();

      // NOT_STARTED_EVENT has no attendance data; only STARTED_EVENT (8/10 · 80%)
      // counts toward July 2026's average.
      expect(await screen.findByText("Monthly Average Participation: 8 Members · 80%")).toBeInTheDocument();
    });

    it("averages across multiple completed events in the same month", async () => {
      const SECOND_STARTED_EVENT = {
        ...STARTED_EVENT,
        id: "event-4",
        name: "Second Fellowship",
        event_date: "2026-07-20",
        present_count: 4,
        eligible_total: 10,
        attendance_percentage: 40,
      };
      server.use(
        http.get(`${API_BASE_URL}/dinner-forecast/events`, () =>
          HttpResponse.json([NOT_STARTED_EVENT, STARTED_EVENT, SECOND_STARTED_EVENT]),
        ),
      );
      renderPage();
      await waitForLoaded();

      // avg_count = (8 + 4) / 2 = 6; avg_pct = (8 + 4) / (10 + 10) * 100 = 60%
      expect(await screen.findByText("Monthly Average Participation: 6 Members · 60%")).toBeInTheDocument();
    });

    it("hides the badge when no event in the month has completed attendance", async () => {
      server.use(
        http.get(`${API_BASE_URL}/dinner-forecast/events`, () =>
          HttpResponse.json([NOT_STARTED_EVENT]),
        ),
      );
      renderPage();
      await waitForLoaded();

      const julyHeading = await screen.findByText("July 2026");
      const julyCard = julyHeading.closest("div.flex.flex-col");
      expect(within(julyCard).queryByText(/Monthly Average Participation/)).not.toBeInTheDocument();
    });

    it("excludes a future-dated event whose attendance was already started from the average", async () => {
      server.use(
        http.get(`${API_BASE_URL}/dinner-forecast/events`, () =>
          HttpResponse.json([FUTURE_STARTED_EVENT]),
        ),
      );
      renderPage();
      await waitForLoaded();

      const marchHeading = await screen.findByText("March 2027");
      const marchCard = marchHeading.closest("div.flex.flex-col");
      expect(within(marchCard).queryByText(/Monthly Average Participation/)).not.toBeInTheDocument();
    });

    it("hides the badge for a month with no dinner events at all", async () => {
      renderPage();
      await waitForLoaded();

      // NOT_STARTED_EVENT/STARTED_EVENT are both July 2026 — August 2026 has
      // zero events and must show no participation badge.
      const augustHeading = await screen.findByText("August 2026");
      const augustCard = augustHeading.closest("div.flex.flex-col");
      expect(within(augustCard).queryByText(/Monthly Average Participation/)).not.toBeInTheDocument();
    });

    it("renders the participation summary as a rose-colored pill badge", async () => {
      renderPage();
      await waitForLoaded();

      const badge = await screen.findByText("Monthly Average Participation: 8 Members · 80%");
      expect(badge.className).toMatch(/rounded-full/);
      expect(badge.className).toMatch(/tone-rose-bg/);
      expect(badge.className).toMatch(/color-tone-rose-text/);
    });
  });

  describe("future-dated events (Story 16.9)", () => {
    beforeEach(() => {
      server.use(
        http.get(`${API_BASE_URL}/dinner-forecast/events`, () =>
          HttpResponse.json([NOT_STARTED_EVENT, STARTED_EVENT, FUTURE_STARTED_EVENT]),
        ),
      );
    });

    it("shows Not started and Take attendance even though attendance was already started", async () => {
      renderPage();
      await waitForLoaded();

      await screen.findByText("Future Fellowship");
      const row = (await screen.findByText("Future Fellowship")).closest("div.grid");
      expect(row).toHaveTextContent("Not started");
      expect(row.querySelector("button")).toHaveTextContent(/take attendance/i);
      // The genuinely past started event is unaffected.
      expect(screen.getByText("8/10 · 80%")).toBeInTheDocument();
    });

    it("navigates straight to the sheet without re-calling start", async () => {
      let startCalled = false;
      server.use(
        http.post(`${API_BASE_URL}/attendance/events/event-3/start`, () => {
          startCalled = true;
          return HttpResponse.json({});
        }),
      );

      renderPage();
      await waitForLoaded();

      const row = (await screen.findByText("Future Fellowship")).closest("div.grid");
      await userEvent.click(row.querySelector("button"));

      expect(await screen.findByText("Attendance sheet page")).toBeInTheDocument();
      expect(startCalled).toBe(false);
    });
  });

  describe("Generate Report", () => {
    let originalCreateObjectURL;
    let originalRevokeObjectURL;

    beforeEach(() => {
      originalCreateObjectURL = URL.createObjectURL;
      originalRevokeObjectURL = URL.revokeObjectURL;
      URL.createObjectURL = vi.fn(() => "blob:mock-url");
      URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    });

    it("downloads the dinner events report", async () => {
      let requestUrl;
      server.use(
        http.get(`${API_BASE_URL}/dinner-forecast/report`, ({ request }) => {
          requestUrl = new URL(request.url);
          return new HttpResponse("fake-pdf-bytes", {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": 'attachment; filename="dinner-forecast.pdf"',
            },
          });
        }),
      );

      renderPage();
      await waitForLoaded();

      await userEvent.click(await screen.findByRole("button", { name: /generate report/i }));

      await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
      expect(requestUrl.searchParams.get("format")).toBe("pdf");
      // Defaults to the historical view — no forecast param sent.
      expect(requestUrl.searchParams.get("forecast")).toBeNull();
    });

    it("sends forecast=true when the Forecast toggle is checked", async () => {
      let requestUrl;
      server.use(
        http.get(`${API_BASE_URL}/dinner-forecast/report`, ({ request }) => {
          requestUrl = new URL(request.url);
          return new HttpResponse("fake-pdf-bytes", {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": 'attachment; filename="dinner-forecast.pdf"',
            },
          });
        }),
      );

      renderPage();
      await waitForLoaded();

      await userEvent.click(screen.getByLabelText(/forecast/i));
      await userEvent.click(await screen.findByRole("button", { name: /generate report/i }));

      await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
      expect(requestUrl.searchParams.get("forecast")).toBe("true");
    });
  });

  describe("start time display (Story 16.27)", () => {
    it("shows the formatted start time next to the date when set", async () => {
      server.use(
        http.get(`${API_BASE_URL}/dinner-forecast/events`, () =>
          HttpResponse.json([{ ...NOT_STARTED_EVENT, start_time: "19:00:00" }]),
        ),
      );
      renderPage();
      await waitForLoaded();

      expect(await screen.findByText("7:00 PM")).toBeInTheDocument();
    });

    it("shows no time line when start_time is not set", async () => {
      renderPage();
      await waitForLoaded();

      await screen.findByText("Welcome Dinner");
      expect(screen.queryByText(/^\d{1,2}:\d{2} (AM|PM)$/)).not.toBeInTheDocument();
    });
  });

  describe("Add to Calendar (Story 16.25)", () => {
    let originalCreateObjectURL;
    let originalRevokeObjectURL;
    let capturedBlob;

    beforeEach(() => {
      originalCreateObjectURL = URL.createObjectURL;
      originalRevokeObjectURL = URL.revokeObjectURL;
      capturedBlob = null;
      URL.createObjectURL = vi.fn((blob) => {
        capturedBlob = blob;
        return "blob:mock-url";
      });
      URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    });

    it("exports a single event to an .ics file", async () => {
      renderPage();
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: /add welcome dinner to calendar/i }));

      expect(URL.createObjectURL).toHaveBeenCalled();
      const text = await capturedBlob.text();
      expect(text).toContain("BEGIN:VEVENT");
      expect(text).toContain("SUMMARY:Welcome Dinner");
      expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    });

    it("exports every event in a month to one .ics file", async () => {
      renderPage();
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: /add month to calendar/i }));

      expect(URL.createObjectURL).toHaveBeenCalled();
      const text = await capturedBlob.text();
      expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(2);
      expect(text).toContain("SUMMARY:Welcome Dinner");
      expect(text).toContain("SUMMARY:Fellowship Night");
    });

    it("exports only upcoming (not past) events at the global level", async () => {
      server.use(
        http.get(`${API_BASE_URL}/dinner-forecast/events`, () =>
          HttpResponse.json([NOT_STARTED_EVENT, STARTED_EVENT, FUTURE_STARTED_EVENT]),
        ),
      );
      renderPage();
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: /add all upcoming to calendar/i }));

      expect(URL.createObjectURL).toHaveBeenCalled();
      const text = await capturedBlob.text();
      // NOT_STARTED_EVENT/STARTED_EVENT are dated 2026-07-05 (in the past
      // relative to "today"); only the 2027-03-15 FUTURE_STARTED_EVENT
      // counts as upcoming.
      expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(1);
      expect(text).toContain("SUMMARY:Future Fellowship");
      expect(text).not.toContain("SUMMARY:Welcome Dinner");
    });
  });
});
