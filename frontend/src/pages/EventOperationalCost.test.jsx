import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import EventOperationalCost from "./EventOperationalCost";

const API_BASE_URL = "http://localhost:8000/api/v1";

let mockCanRead = true;
let mockCanWrite = true;
vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: mockCanRead, canWrite: mockCanWrite }),
}));

const EVENT = { id: "event-1", name: "Gala", date: "2026-08-15", created_at: new Date().toISOString() };
const CATEGORY = { id: "cat-1", name: "Decoration" };

const COST_1 = {
  id: "cost-1",
  event_id: "event-1",
  name: "Flowers",
  category: "Decoration",
  quantity: 2,
  unit_price: 50,
  total_cost: 100,
};
const COST_2 = {
  id: "cost-2",
  event_id: "event-1",
  name: "Chairs",
  category: "Venue",
  quantity: 10,
  unit_price: 20,
  total_cost: 200,
};

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
  await waitFor(() => expect(screen.queryByText(/loading items…/i)).not.toBeInTheDocument());
}

describe("EventOperationalCost", () => {
  beforeEach(() => {
    mockCanRead = true;
    mockCanWrite = true;
    server.use(
      http.get(`${API_BASE_URL}/event-cost-categories`, () => HttpResponse.json([CATEGORY])),
      http.get(`${API_BASE_URL}/events/event-1/costs`, () => HttpResponse.json([COST_1, COST_2])),
    );
  });

  it("denies access without events.costs read", async () => {
    mockCanRead = false;
    mockCanWrite = false;
    render(<EventOperationalCost event={EVENT} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/do not have permission/i);
  });

  it("shows a flat table with category chips and a total row", async () => {
    render(<EventOperationalCost event={EVENT} />);
    await waitForLoaded();

    expect(screen.getByText("Flowers").closest("tr")).toHaveTextContent("100");
    expect(screen.getByText("Decoration")).toBeInTheDocument();
    expect(screen.getByText("Chairs").closest("tr")).toHaveTextContent("200");
    expect(screen.getByText("Venue")).toBeInTheDocument();

    const totalRow = screen.getByText("Total").closest("tr");
    expect(totalRow).toHaveTextContent("HKD 300");
  });

  it("creates a new cost item with computed total", async () => {
    let createdBody;
    server.use(
      http.post(`${API_BASE_URL}/events/event-1/costs`, async ({ request }) => {
        createdBody = await request.json();
        return HttpResponse.json({ ...COST_1, id: "cost-3", ...createdBody, total_cost: createdBody.quantity * createdBody.unit_price }, { status: 201 });
      }),
    );

    render(<EventOperationalCost event={EVENT} />);
    await waitForLoaded();

    await userEvent.click(screen.getByRole("button", { name: "+ Add Item" }));
    await userEvent.type(screen.getByLabelText("Name"), "Printing");
    await userEvent.clear(screen.getByLabelText("Quantity"));
    await userEvent.type(screen.getByLabelText("Quantity"), "3");
    await userEvent.type(screen.getByLabelText("Unit Price"), "10");
    expect(screen.getByLabelText("Total Cost")).toHaveValue("HKD 30");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(createdBody).toBeDefined());
    expect(createdBody.name).toBe("Printing");
    expect(createdBody.quantity).toBe(3);
    expect(createdBody.unit_price).toBe(10);
  });

  it("deletes an item after confirmation", async () => {
    let deleteCalled = false;
    server.use(
      http.delete(`${API_BASE_URL}/events/event-1/costs/cost-1`, () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<EventOperationalCost event={EVENT} />);
    await waitForLoaded();

    const row = screen.getByText("Flowers").closest("tr");
    await userEvent.click(
      Array.from(row.querySelectorAll("button")).find((b) => b.textContent === "Delete"),
    );
    await waitFor(() => expect(deleteCalled).toBe(true));

    window.confirm.mockRestore();
  });

  it("hides write actions for read-only users", async () => {
    mockCanWrite = false;
    render(<EventOperationalCost event={EVENT} />);
    await waitForLoaded();

    expect(screen.queryByText("+ Add Item")).not.toBeInTheDocument();
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
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

    it("downloads the cost report with the selected format", async () => {
      let requestUrl;
      server.use(
        http.get(`${API_BASE_URL}/events/event-1/costs/report`, ({ request }) => {
          requestUrl = new URL(request.url);
          return new HttpResponse("fake-pdf-bytes", {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": 'attachment; filename="event-operational-cost.pdf"',
            },
          });
        }),
      );

      render(<EventOperationalCost event={EVENT} />);
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: "Generate Report" }));

      await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
      expect(requestUrl.searchParams.get("format")).toBe("pdf");
    });
  });
});
