import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import EventGuestList from "./EventGuestList";

const API_BASE_URL = "http://localhost:8000/api/v1";

let mockCanRead = true;
let mockCanWrite = true;
vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: mockCanRead, canWrite: mockCanWrite }),
}));

const MEMBER = { id: "member-1", first_name: "Contact", last_name: "Rotarian" };

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

const TABLE_ROW = {
  id: "table-1",
  event_id: "event-1",
  table_number: 1,
  theme_name: "Gold",
  rotary_name: "Table 1 Rotary",
};

const GUEST = {
  id: "guest-1",
  event_id: "event-1",
  title: "Mr",
  surname: "Smith",
  first_name: "John",
  contact_rotarian_id: MEMBER.id,
  contact_rotarian_name: "Contact Rotarian",
  payment_status: "paid",
  early_bird: false,
  table_number: 1,
};

const GUEST_2 = {
  ...GUEST,
  id: "guest-2",
  surname: "Jones",
  first_name: "Amy",
  payment_status: "not_paid",
  early_bird: true,
  table_number: null,
};

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
  await waitFor(() => expect(screen.queryByText(/loading guest data…/i)).not.toBeInTheDocument());
}

describe("EventGuestList", () => {
  beforeEach(() => {
    mockCanRead = true;
    mockCanWrite = true;
    server.use(
      http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER])),
      http.get(`${API_BASE_URL}/events/event-1/guests`, () => HttpResponse.json([GUEST, GUEST_2])),
      http.get(`${API_BASE_URL}/events/event-1/table-mapping`, () => HttpResponse.json([TABLE_ROW])),
      http.get(`${API_BASE_URL}/events/event-1/setup`, () => HttpResponse.json(SETUP)),
    );
  });

  it("denies access without events.guests read", async () => {
    mockCanRead = false;
    mockCanWrite = false;
    render(<EventGuestList event={EVENT} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/do not have permission/i);
  });

  it("shows summary cards computed from guests and setup prices", async () => {
    render(<EventGuestList event={EVENT} />);
    await waitForLoaded();

    await screen.findByText("Guests Registered");
    const registeredCard = screen.getByText("Guests Registered").parentElement;
    expect(registeredCard).toHaveTextContent("2");
    const paidCard = screen.getByText("Payments Received").parentElement;
    expect(paidCard).toHaveTextContent("1");
    // 500 (normal, Smith) + 400 (early bird, Jones) = 900
    expect(screen.getByText("HKD 900")).toBeInTheDocument();
  });

  it("resolves Theme Name and Rotary Name from table mapping", async () => {
    render(<EventGuestList event={EVENT} />);
    await waitForLoaded();

    const row = screen.getByText("Smith").closest("tr");
    expect(row).toHaveTextContent("Gold");
    expect(row).toHaveTextContent("Table 1 Rotary");

    const unassignedRow = screen.getByText("Jones").closest("tr");
    expect(unassignedRow).toHaveTextContent("—");
  });

  it("toggles payment status inline", async () => {
    let updatedBody;
    server.use(
      http.patch(`${API_BASE_URL}/events/event-1/guests/guest-1`, async ({ request }) => {
        updatedBody = await request.json();
        return HttpResponse.json({ ...GUEST, payment_status: "not_paid" });
      }),
    );

    render(<EventGuestList event={EVENT} />);
    await waitForLoaded();

    await userEvent.click(screen.getByRole("button", { name: "Paid" }));
    await waitFor(() => expect(updatedBody).toBeDefined());
    expect(updatedBody.payment_status).toBe("not_paid");
  });

  it("deletes a guest after confirmation", async () => {
    let deleteCalled = false;
    server.use(
      http.delete(`${API_BASE_URL}/events/event-1/guests/guest-1`, () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<EventGuestList event={EVENT} />);
    await waitForLoaded();

    const row = screen.getByText("Smith").closest("tr");
    await userEvent.click(
      Array.from(row.querySelectorAll("button")).find((b) => b.textContent === "Delete"),
    );
    await waitFor(() => expect(deleteCalled).toBe(true));

    window.confirm.mockRestore();
  });

  it("hides write actions for read-only users", async () => {
    mockCanWrite = false;
    render(<EventGuestList event={EVENT} />);
    await waitForLoaded();

    expect(screen.queryByText("+ Add Guest")).not.toBeInTheDocument();
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
  });

  it("creates a new guest with required fields", async () => {
    let createdBody;
    server.use(
      http.post(`${API_BASE_URL}/events/event-1/guests`, async ({ request }) => {
        createdBody = await request.json();
        return HttpResponse.json({ ...GUEST, id: "guest-3", ...createdBody }, { status: 201 });
      }),
    );

    render(<EventGuestList event={EVENT} />);
    await waitForLoaded();

    await userEvent.click(screen.getByRole("button", { name: "+ Add Guest" }));
    await userEvent.type(screen.getByLabelText("Surname"), "Doe");
    await userEvent.type(screen.getByLabelText("First Name"), "Jane");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(createdBody).toBeDefined());
    expect(createdBody.surname).toBe("Doe");
    expect(createdBody.first_name).toBe("Jane");
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

    it("downloads the guest list report with the selected format", async () => {
      let requestUrl;
      server.use(
        http.get(`${API_BASE_URL}/events/event-1/guests/report`, ({ request }) => {
          requestUrl = new URL(request.url);
          return new HttpResponse("fake-pdf-bytes", {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": 'attachment; filename="event-guest-list.pdf"',
            },
          });
        }),
      );

      render(<EventGuestList event={EVENT} />);
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: "Generate Report" }));

      await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
      expect(requestUrl.searchParams.get("format")).toBe("pdf");
    });
  });
});
