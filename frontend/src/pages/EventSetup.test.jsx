import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import EventSetup from "./EventSetup";

const API_BASE_URL = "http://localhost:8000/api/v1";

let mockCanRead = true;
let mockCanWrite = true;
vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: mockCanRead, canWrite: mockCanWrite }),
}));

const EVENT = {
  id: "event-1",
  name: "Annual Ball",
  date: "2026-08-15",
  created_at: new Date().toISOString(),
};

const SETUP = {
  event_id: "event-1",
  ticket_price_normal: 500,
  ticket_price_early_bird: 400,
  lucky_draw_ticket_price: 50,
};

const TABLE_ROW = { id: "table-1", event_id: "event-1", table_number: 1, theme_name: "Gold", rotary_name: "Table 1" };

describe("EventSetup", () => {
  beforeEach(() => {
    mockCanRead = true;
    mockCanWrite = true;
    server.use(
      http.get(`${API_BASE_URL}/events/event-1/setup`, () => HttpResponse.json(SETUP)),
      http.get(`${API_BASE_URL}/events/event-1/table-mapping`, () => HttpResponse.json([TABLE_ROW])),
      http.get(`${API_BASE_URL}/event-cost-categories`, () => HttpResponse.json([{ id: "cc-1", name: "Venue" }])),
      http.get(`${API_BASE_URL}/event-sponsor-categories`, () =>
        HttpResponse.json([{ id: "sc-1", name: "Gold" }]),
      ),
    );
  });

  it("denies access without events.setup read", async () => {
    mockCanRead = false;
    mockCanWrite = false;
    render(<EventSetup event={EVENT} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/do not have permission/i);
  });

  it("loads the selected event's ticket prices", async () => {
    render(<EventSetup event={EVENT} />);

    await waitFor(() => expect(screen.getByLabelText(/ticket price \(normal\)/i)).toHaveValue(500));
    expect(screen.getByLabelText(/ticket price \(early bird\)/i)).toHaveValue(400);
    expect(screen.getByLabelText(/lucky draw ticket price/i)).toHaveValue(50);
  });

  it("saves ticket prices", async () => {
    let savedBody;
    server.use(
      http.put(`${API_BASE_URL}/events/event-1/setup`, async ({ request }) => {
        savedBody = await request.json();
        return HttpResponse.json({ ...SETUP, ...savedBody });
      }),
    );

    render(<EventSetup event={EVENT} />);
    await waitFor(() => expect(screen.getByLabelText(/ticket price \(normal\)/i)).toHaveValue(500));

    await userEvent.clear(screen.getByLabelText(/ticket price \(normal\)/i));
    await userEvent.type(screen.getByLabelText(/ticket price \(normal\)/i), "600");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(savedBody).toBeDefined());
    expect(savedBody.ticket_price_normal).toBe(600);
    expect(screen.getByText("Prices saved.")).toBeInTheDocument();
  });

  it("shows the table mapping section with existing rows", async () => {
    render(<EventSetup event={EVENT} />);

    expect(await screen.findByText("Table Mapping")).toBeInTheDocument();
    expect(screen.getByLabelText("Table number 1")).toHaveValue(1);
    expect(screen.getByLabelText("Theme name for table 1")).toHaveValue("Gold");
  });

  it("shows cost and sponsor category lists", async () => {
    render(<EventSetup event={EVENT} />);

    expect(await screen.findByText("Cost Categories")).toBeInTheDocument();
    expect(screen.getByText("Venue")).toBeInTheDocument();
    expect(screen.getByText("Sponsor Categories")).toBeInTheDocument();
    expect(screen.getAllByText("Gold").length).toBeGreaterThan(0);
  });

  it("adds a new cost category", async () => {
    let createdBody;
    server.use(
      http.post(`${API_BASE_URL}/event-cost-categories`, async ({ request }) => {
        createdBody = await request.json();
        return HttpResponse.json({ id: "cc-2", ...createdBody }, { status: 201 });
      }),
    );

    render(<EventSetup event={EVENT} />);
    await screen.findByText("Cost Categories");

    await userEvent.type(screen.getByLabelText("Cost Categories name"), "Printing");
    await userEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);

    await waitFor(() => expect(createdBody).toBeDefined());
    expect(createdBody.name).toBe("Printing");
  });
});
