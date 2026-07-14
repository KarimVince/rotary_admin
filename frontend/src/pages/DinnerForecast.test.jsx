import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import { currentRotaryYear } from "../utils/rotaryYear";
import DinnerForecast from "./DinnerForecast";

const API_BASE_URL = "http://localhost:8000/api/v1";
const YEAR = currentRotaryYear();

let mockCanRead = true;
let mockCanWrite = true;
vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: mockCanRead, canWrite: mockCanWrite }),
}));

const MEMBER = { id: "member-1", first_name: "Contact", last_name: "Person" };

const EVENT = {
  id: "event-1",
  name: "Welcome Dinner",
  event_date: `${YEAR}-08-15`,
  event_type: "dinner",
  rotary_year: YEAR,
  location: "Club House",
  speaker_name: "Jane Speaker",
  ngo_organisation_name: "Helping Hands",
  speaker_rotary_contact_member_id: MEMBER.id,
  topics_description: "Intro to the club",
  member_only: false,
  created_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  attendance_started: false,
};

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
}

describe("DinnerForecast", () => {
  beforeEach(() => {
    mockCanRead = true;
    mockCanWrite = true;
    server.use(
      http.get(`${API_BASE_URL}/dinner-forecast/events`, () => HttpResponse.json([EVENT])),
      http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER])),
    );
  });

  it("lists dinner forecast events", async () => {
    render(<DinnerForecast />);
    await waitForLoaded();

    expect(screen.getByText("Welcome Dinner")).toBeInTheDocument();
    expect(screen.getByText("Club House")).toBeInTheDocument();
    expect(screen.getByText("Jane Speaker")).toBeInTheDocument();
    expect(screen.getByText("Helping Hands")).toBeInTheDocument();
    expect(screen.getByText("Contact Person")).toBeInTheDocument();
  });

  it("styles the New Dinner Event button as the standard primary action button", async () => {
    render(<DinnerForecast />);
    await waitForLoaded();

    expect(screen.getByRole("button", { name: "New Dinner Event" })).toHaveClass(
      "btn-add-member",
    );
  });

  it("shows an empty state when no events exist for the selected year", async () => {
    server.use(http.get(`${API_BASE_URL}/dinner-forecast/events`, () => HttpResponse.json([])));

    render(<DinnerForecast />);
    await waitForLoaded();

    expect(screen.getByText(/no dinner events planned/i)).toBeInTheDocument();
  });

  it("hides write actions for read-only users", async () => {
    mockCanWrite = false;
    render(<DinnerForecast />);
    await waitForLoaded();

    expect(screen.queryByText("New Dinner Event")).not.toBeInTheDocument();
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("denies access for a user without attendance.forecast read", async () => {
    mockCanRead = false;
    mockCanWrite = false;
    render(<DinnerForecast />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/do not have permission/i);
  });

  it("shows the Member Only column value for each event", async () => {
    server.use(
      http.get(`${API_BASE_URL}/dinner-forecast/events`, () =>
        HttpResponse.json([{ ...EVENT, member_only: true }]),
      ),
    );

    render(<DinnerForecast />);
    await waitForLoaded();

    const row = screen.getByText("Welcome Dinner").closest("tr");
    expect(row).toHaveTextContent("Yes");
  });

  it("creates a new dinner forecast event", async () => {
    let createdBody;
    server.use(
      http.post(`${API_BASE_URL}/dinner-forecast/events`, async ({ request }) => {
        createdBody = await request.json();
        return HttpResponse.json({ ...EVENT, id: "event-2", ...createdBody }, { status: 201 });
      }),
    );

    render(<DinnerForecast />);
    await waitForLoaded();

    await userEvent.click(screen.getByRole("button", { name: "New Dinner Event" }));
    await userEvent.type(screen.getByLabelText("Event name"), "Fellowship Night");
    await userEvent.type(screen.getByLabelText("Date"), `${YEAR}-09-01`);
    await userEvent.type(screen.getByLabelText("Location"), "Community Hall");
    await userEvent.type(screen.getByLabelText("NGO / Organisation"), "New NGO Not In System");
    await userEvent.selectOptions(
      screen.getByLabelText("Speaker Rotary contact"),
      screen.getByRole("option", { name: "Contact Person" }),
    );
    await userEvent.click(screen.getByLabelText("Member Only"));
    await userEvent.click(screen.getByRole("button", { name: "Create event" }));

    await waitFor(() => expect(createdBody).toBeDefined());
    expect(createdBody.name).toBe("Fellowship Night");
    expect(createdBody.location).toBe("Community Hall");
    expect(createdBody.ngo_organisation_name).toBe("New NGO Not In System");
    expect(createdBody.speaker_rotary_contact_member_id).toBe(MEMBER.id);
    expect(createdBody.member_only).toBe(true);
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

    render(<DinnerForecast />);
    await waitForLoaded();

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteCalled).toBe(true));

    window.confirm.mockRestore();
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

    it("downloads a report with the selected format and event filter", async () => {
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

      render(<DinnerForecast />);
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: "Generate Report" }));

      await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
      expect(requestUrl.searchParams.get("format")).toBe("pdf");
      expect(requestUrl.searchParams.get("event_type")).toBe("all");
    });
  });
});
