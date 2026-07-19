import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import EventLuckyDraw from "./EventLuckyDraw";

const API_BASE_URL = "http://localhost:8000/api/v1";

let mockCanRead = true;
let mockCanWrite = true;
vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: mockCanRead, canWrite: mockCanWrite }),
}));

const EVENT = { id: "event-1", name: "Annual Ball", date: "2026-08-15", created_at: new Date().toISOString() };
const SETUP = { event_id: "event-1", ticket_price_normal: 500, ticket_price_early_bird: 400, lucky_draw_ticket_price: 50 };
const CONFIG = { event_id: "event-1", tickets_sold: 100, other_donation: 500 };

const AUCTION_ITEM = {
  id: "item-1",
  event_id: "event-1",
  lot_ref: "A-1",
  name: "Painting",
  value_hkd: 5000,
  donor_sponsor: "Gallery",
  contact_rotary_id: null,
  contact_rotary_name: null,
  item_type: "auction",
  ad_page: false,
  status: "received",
  value_sold: 6000,
};

const LUCKY_DRAW_ITEM = {
  ...AUCTION_ITEM,
  id: "item-2",
  lot_ref: "L-1",
  name: "Voucher",
  item_type: "lucky_draw",
  value_sold: null,
};

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
  await waitFor(() => expect(screen.queryByText(/loading item data…/i)).not.toBeInTheDocument());
}

describe("EventLuckyDraw", () => {
  beforeEach(() => {
    mockCanRead = true;
    mockCanWrite = true;
    server.use(
      http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/events/event-1/items`, () =>
        HttpResponse.json([AUCTION_ITEM, LUCKY_DRAW_ITEM]),
      ),
      http.get(`${API_BASE_URL}/events/event-1/lucky-draw-config`, () => HttpResponse.json(CONFIG)),
      http.get(`${API_BASE_URL}/events/event-1/setup`, () => HttpResponse.json(SETUP)),
    );
  });

  it("denies access without events.lucky_draw read", async () => {
    mockCanRead = false;
    mockCanWrite = false;
    render(<EventLuckyDraw event={EVENT} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/do not have permission/i);
  });

  function summaryCard(label) {
    return screen.getByText(label).parentElement;
  }

  it("computes summary cards from config, items, and setup prices", async () => {
    render(<EventLuckyDraw event={EVENT} />);
    await waitForLoaded();

    expect(summaryCard("Tickets Sold")).toHaveTextContent("100");

    expect(summaryCard("Lucky Draw Amount")).toHaveTextContent("HKD 5,000"); // 100 * 50
    expect(summaryCard("Auction Amount")).toHaveTextContent("HKD 6,000"); // value_sold of the auction item
    expect(summaryCard("Total Donations")).toHaveTextContent("HKD 11,500"); // 5000 + 6000 + 500
    expect(summaryCard("Total Gifts")).toHaveTextContent("2");
  });

  it("shows Value Sold only for auction items", async () => {
    render(<EventLuckyDraw event={EVENT} />);
    await waitForLoaded();

    const auctionRow = screen.getByText("Painting").closest("tr");
    expect(auctionRow).toHaveTextContent("HKD 6,000");

    const luckyDrawRow = screen.getByText("Voucher").closest("tr");
    const cells = Array.from(luckyDrawRow.querySelectorAll("td"));
    expect(cells[cells.length - 2]).toHaveTextContent("—");
  });

  it("hides write actions for read-only users", async () => {
    mockCanWrite = false;
    render(<EventLuckyDraw event={EVENT} />);
    await waitForLoaded();

    expect(screen.queryByText("+ Add Item")).not.toBeInTheDocument();
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
  });

  it("creates a new item, showing Value Sold field only for auction type", async () => {
    let createdBody;
    server.use(
      http.post(`${API_BASE_URL}/events/event-1/items`, async ({ request }) => {
        createdBody = await request.json();
        return HttpResponse.json({ ...AUCTION_ITEM, id: "item-3", ...createdBody }, { status: 201 });
      }),
    );

    render(<EventLuckyDraw event={EVENT} />);
    await waitForLoaded();

    await userEvent.click(screen.getByRole("button", { name: "+ Add Item" }));
    expect(screen.getByLabelText("Type")).toHaveValue("auction");
    expect(screen.getByLabelText("Value Sold")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Type"), "lucky_draw");
    expect(screen.queryByLabelText("Value Sold")).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Name"), "Gift Basket");
    const modal = screen.getByRole("heading", { name: "New item" }).closest(".modal-dialog");
    await userEvent.click(within(modal).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(createdBody).toBeDefined());
    expect(createdBody.name).toBe("Gift Basket");
    expect(createdBody.item_type).toBe("lucky_draw");
    expect(createdBody.value_sold).toBeNull();
  });

  it("deletes an item after confirmation", async () => {
    let deleteCalled = false;
    server.use(
      http.delete(`${API_BASE_URL}/events/event-1/items/item-1`, () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<EventLuckyDraw event={EVENT} />);
    await waitForLoaded();

    const row = screen.getByText("Painting").closest("tr");
    await userEvent.click(
      Array.from(row.querySelectorAll("button")).find((b) => b.textContent === "Delete"),
    );
    await waitFor(() => expect(deleteCalled).toBe(true));

    window.confirm.mockRestore();
  });

  it("saves the tickets sold / other donation config", async () => {
    let savedBody;
    server.use(
      http.put(`${API_BASE_URL}/events/event-1/lucky-draw-config`, async ({ request }) => {
        savedBody = await request.json();
        return HttpResponse.json({ ...CONFIG, ...savedBody });
      }),
    );

    render(<EventLuckyDraw event={EVENT} />);
    await waitForLoaded();

    await userEvent.clear(screen.getByLabelText(/tickets sold/i));
    await userEvent.type(screen.getByLabelText(/tickets sold/i), "150");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(savedBody).toBeDefined());
    expect(savedBody.tickets_sold).toBe(150);
  });

  describe("Reports", () => {
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

    it("downloads the programme report", async () => {
      let called = false;
      server.use(
        http.get(`${API_BASE_URL}/events/event-1/items/report/programme`, () => {
          called = true;
          return new HttpResponse("fake-pdf", {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": 'attachment; filename="lucky-draw-programme.pdf"',
            },
          });
        }),
      );

      render(<EventLuckyDraw event={EVENT} />);
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: "Programme List" }));
      await waitFor(() => expect(called).toBe(true));
      expect(URL.createObjectURL).toHaveBeenCalled();
    });

    it("downloads the lucky draw results report", async () => {
      let called = false;
      server.use(
        http.get(`${API_BASE_URL}/events/event-1/items/report/results`, () => {
          called = true;
          return new HttpResponse("fake-pdf", {
            headers: { "Content-Type": "application/pdf" },
          });
        }),
      );

      render(<EventLuckyDraw event={EVENT} />);
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: "Lucky Draw Results" }));
      await waitFor(() => expect(called).toBe(true));
    });

    it("downloads the auction receipts report", async () => {
      let called = false;
      server.use(
        http.get(`${API_BASE_URL}/events/event-1/items/report/auction-receipts`, () => {
          called = true;
          return new HttpResponse("fake-pdf", {
            headers: { "Content-Type": "application/pdf" },
          });
        }),
      );

      render(<EventLuckyDraw event={EVENT} />);
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: "Auction Receipts" }));
      await waitFor(() => expect(called).toBe(true));
    });

    it("shows an error if a report fails to generate", async () => {
      server.use(
        http.get(`${API_BASE_URL}/events/event-1/items/report/auction-receipts`, () =>
          HttpResponse.json({ detail: "No auction items to generate receipts for" }, { status: 400 }),
        ),
      );

      render(<EventLuckyDraw event={EVENT} />);
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: "Auction Receipts" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "No auction items to generate receipts for",
      );
    });
  });
});
