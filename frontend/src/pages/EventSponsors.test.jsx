import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import EventSponsors from "./EventSponsors";

const API_BASE_URL = "http://localhost:8000/api/v1";

let mockCanRead = true;
let mockCanWrite = true;
vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: mockCanRead, canWrite: mockCanWrite }),
}));

const EVENT = { id: "event-1", name: "Gala", date: "2026-08-15", created_at: new Date().toISOString() };
const CATEGORY = { id: "cat-1", name: "Gold" };

const SPONSOR = {
  id: "sponsor-1",
  event_id: "event-1",
  name: "Acme Corp",
  category: "Gold",
  quantity: 1,
  unit_price: 5000,
  total_cost: 5000,
};

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
  await waitFor(() => expect(screen.queryByText(/loading items…/i)).not.toBeInTheDocument());
}

describe("EventSponsors", () => {
  beforeEach(() => {
    mockCanRead = true;
    mockCanWrite = true;
    server.use(
      http.get(`${API_BASE_URL}/event-sponsor-categories`, () => HttpResponse.json([CATEGORY])),
      http.get(`${API_BASE_URL}/events/event-1/sponsors`, () => HttpResponse.json([SPONSOR])),
    );
  });

  it("denies access without events.sponsors read", async () => {
    mockCanRead = false;
    mockCanWrite = false;
    render(<EventSponsors event={EVENT} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/do not have permission/i);
  });

  it("shows sponsor grouped by category with Total Amount column", async () => {
    render(<EventSponsors event={EVENT} />);
    await waitForLoaded();

    expect(screen.getByText("Total Amount")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp").closest("tr")).toHaveTextContent("HKD 5,000");
  });

  it("creates a new sponsor entry", async () => {
    let createdBody;
    server.use(
      http.post(`${API_BASE_URL}/events/event-1/sponsors`, async ({ request }) => {
        createdBody = await request.json();
        return HttpResponse.json({ ...SPONSOR, id: "sponsor-2", ...createdBody }, { status: 201 });
      }),
    );

    render(<EventSponsors event={EVENT} />);
    await waitForLoaded();

    await userEvent.click(screen.getByRole("button", { name: "+ Add Item" }));
    await userEvent.type(screen.getByLabelText("Name"), "Beta Ltd");
    await userEvent.type(screen.getByLabelText("Unit Price"), "1000");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(createdBody).toBeDefined());
    expect(createdBody.name).toBe("Beta Ltd");
    expect(createdBody.unit_price).toBe(1000);
  });
});
