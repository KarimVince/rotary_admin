import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import EventList from "./EventList";

const API_BASE_URL = "http://localhost:8000/api/v1";

let mockCanRead = true;
let mockCanWrite = true;
vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: mockCanRead, canWrite: mockCanWrite }),
}));

const MEMBER = { id: "member-1", first_name: "Chair", last_name: "Person" };

function futureDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

const UPCOMING_EVENT = {
  id: "event-1",
  name: "Annual Ball",
  date: futureDate(30),
  hour: "19:30:00",
  venue: "Grand Hotel",
  oc_chair_member_id: MEMBER.id,
  oc_chair_member_name: "Chair Person",
  theme: "Masquerade",
  rotary_year: new Date().getFullYear(),
  ticket_price_normal: null,
  created_at: new Date().toISOString(),
  guest_count: 12,
  sponsor_count: 3,
  net_proceeds: null,
};

const PAST_EVENT = {
  ...UPCOMING_EVENT,
  id: "event-0",
  name: "Old Ball",
  date: "2020-08-15",
  net_proceeds: 4200,
};

function renderEventList() {
  return render(
    <MemoryRouter>
      <EventList />
    </MemoryRouter>,
  );
}

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
}

describe("EventList", () => {
  beforeEach(() => {
    mockCanRead = true;
    mockCanWrite = true;
    server.use(
      http.get(`${API_BASE_URL}/events`, () => HttpResponse.json([UPCOMING_EVENT, PAST_EVENT])),
      http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER])),
    );
  });

  it("splits events into upcoming and past sections", async () => {
    renderEventList();
    await waitForLoaded();

    expect(screen.getByText("Annual Ball")).toBeInTheDocument();
    expect(
      screen.getByText((_, el) => el.tagName.toLowerCase() === "span" && el.textContent === "12 guests"),
    ).toBeInTheDocument();
    expect(
      screen.getByText((_, el) => el.tagName.toLowerCase() === "span" && el.textContent === "3 sponsors"),
    ).toBeInTheDocument();

    const pastRow = screen.getByText("Old Ball").closest("tr");
    expect(pastRow).toHaveTextContent("Grand Hotel");
    expect(pastRow).toHaveTextContent("HKD 4,200");
    expect(pastRow).toHaveTextContent("15 Aug 2020");
  });

  it("shows an empty state when no events exist", async () => {
    server.use(http.get(`${API_BASE_URL}/events`, () => HttpResponse.json([])));

    renderEventList();
    await waitForLoaded();

    expect(screen.getByText(/no upcoming events/i)).toBeInTheDocument();
    expect(screen.getByText(/no past events/i)).toBeInTheDocument();
  });

  it("links each upcoming card to the Manage Project page", async () => {
    renderEventList();
    await waitForLoaded();

    const link = screen.getByRole("link", { name: /manage project/i });
    expect(link).toHaveAttribute("href", "/events/manage?event=event-1");
  });

  it("hides write actions for read-only users", async () => {
    mockCanWrite = false;
    renderEventList();
    await waitForLoaded();

    expect(screen.queryByText("New Event")).not.toBeInTheDocument();
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("denies access for a user without events.list read", async () => {
    mockCanRead = false;
    mockCanWrite = false;
    renderEventList();
    expect(await screen.findByRole("alert")).toHaveTextContent(/do not have permission/i);
  });

  it("creates a new event", async () => {
    let createdBody;
    server.use(
      http.post(`${API_BASE_URL}/events`, async ({ request }) => {
        createdBody = await request.json();
        return HttpResponse.json({ ...UPCOMING_EVENT, id: "event-2", ...createdBody }, { status: 201 });
      }),
    );

    renderEventList();
    await waitForLoaded();

    await userEvent.click(screen.getByRole("button", { name: "New Event" }));
    await userEvent.type(screen.getByLabelText("Name"), "Fellowship Night");
    await userEvent.type(screen.getByLabelText("Date"), futureDate(60));
    await userEvent.type(screen.getByLabelText("Venue"), "Community Hall");
    await userEvent.selectOptions(
      screen.getByLabelText("OC Chair"),
      screen.getByRole("option", { name: "Chair Person" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(createdBody).toBeDefined());
    expect(createdBody.name).toBe("Fellowship Night");
    expect(createdBody.venue).toBe("Community Hall");
    expect(createdBody.oc_chair_member_id).toBe(MEMBER.id);
  });

  it("deletes an event after confirmation", async () => {
    let deleteCalled = false;
    server.use(
      http.delete(`${API_BASE_URL}/events/event-1`, () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderEventList();
    await waitForLoaded();

    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    await userEvent.click(deleteButtons[0]);
    await waitFor(() => expect(deleteCalled).toBe(true));

    window.confirm.mockRestore();
  });
});
