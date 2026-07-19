import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import EventRundown from "./EventRundown";

const API_BASE_URL = "http://localhost:8000/api/v1";

let mockCanRead = true;
let mockCanWrite = true;
vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: mockCanRead, canWrite: mockCanWrite }),
}));

const EVENT = { id: "event-1", name: "Gala", date: "2026-08-15", created_at: new Date().toISOString() };

const ROW_1 = {
  id: "row-1",
  event_id: "event-1",
  time: "Before 7:30 PM",
  activity: "Welcoming guests - Cocktail",
  highlight: false,
  sort_order: 0,
};
const ROW_2 = {
  id: "row-2",
  event_id: "event-1",
  time: "7:30 PM",
  activity: "Ring Bell, guest walk to their seat",
  highlight: true,
  sort_order: 1,
};

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
  await waitFor(() => expect(screen.queryByText(/loading rundown…/i)).not.toBeInTheDocument());
}

describe("EventRundown", () => {
  beforeEach(() => {
    mockCanRead = true;
    mockCanWrite = true;
    server.use(
      http.get(`${API_BASE_URL}/events/event-1/rundown`, () => HttpResponse.json([ROW_1, ROW_2])),
    );
  });

  it("denies access without events.rundown read", async () => {
    mockCanRead = false;
    mockCanWrite = false;
    render(<EventRundown event={EVENT} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/do not have permission/i);
  });

  it("shows rundown rows with highlight styling", async () => {
    render(<EventRundown event={EVENT} />);
    await waitForLoaded();

    expect(screen.getByLabelText("Time for row 1")).toHaveValue("Before 7:30 PM");
    expect(screen.getByLabelText("Activity for row 2")).toHaveValue("Ring Bell, guest walk to their seat");
    expect(screen.getByLabelText("Highlight for row 2")).toBeChecked();
  });

  it("adds a new row", async () => {
    let createCalled = false;
    server.use(
      http.post(`${API_BASE_URL}/events/event-1/rundown`, () => {
        createCalled = true;
        return HttpResponse.json(
          { id: "row-3", event_id: "event-1", time: "", activity: "", highlight: false, sort_order: 2 },
          { status: 201 },
        );
      }),
    );

    render(<EventRundown event={EVENT} />);
    await waitForLoaded();

    await userEvent.click(screen.getByRole("button", { name: "+ Add Row" }));
    await waitFor(() => expect(createCalled).toBe(true));
  });

  it("saves edits to a row", async () => {
    let updatedBody;
    server.use(
      http.patch(`${API_BASE_URL}/events/event-1/rundown/row-1`, async ({ request }) => {
        updatedBody = await request.json();
        return HttpResponse.json({ ...ROW_1, ...updatedBody });
      }),
    );

    render(<EventRundown event={EVENT} />);
    await waitForLoaded();

    await userEvent.clear(screen.getByLabelText("Activity for row 1"));
    await userEvent.type(screen.getByLabelText("Activity for row 1"), "Updated activity");

    const row1 = screen.getByLabelText("Time for row 1").closest("div.flex");
    await userEvent.click(within(row1).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updatedBody).toBeDefined());
    expect(updatedBody.activity).toBe("Updated activity");
  });

  it("reorders rows via the Down button", async () => {
    let reorderedItems;
    server.use(
      http.patch(`${API_BASE_URL}/events/event-1/rundown/reorder`, async ({ request }) => {
        reorderedItems = (await request.json()).items;
        return HttpResponse.json([ROW_2, ROW_1]);
      }),
    );

    render(<EventRundown event={EVENT} />);
    await waitForLoaded();

    await userEvent.click(screen.getByLabelText("Move row 1 down"));

    await waitFor(() => expect(reorderedItems).toBeDefined());
    expect(reorderedItems[0]).toEqual({ id: "row-2", sort_order: 0 });
    expect(reorderedItems[1]).toEqual({ id: "row-1", sort_order: 1 });
  });

  it("deletes a row after confirmation", async () => {
    let deleteCalled = false;
    server.use(
      http.delete(`${API_BASE_URL}/events/event-1/rundown/row-1`, () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<EventRundown event={EVENT} />);
    await waitForLoaded();

    const row1 = screen.getByLabelText("Time for row 1").closest("div.flex");
    await userEvent.click(within(row1).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteCalled).toBe(true));

    window.confirm.mockRestore();
  });

  it("hides write actions for read-only users", async () => {
    mockCanWrite = false;
    render(<EventRundown event={EVENT} />);
    await waitForLoaded();

    expect(screen.queryByText("+ Add Row")).not.toBeInTheDocument();
    expect(screen.queryByText("Save")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Time for row 1")).toBeDisabled();
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

    it("downloads the rundown report with the selected format", async () => {
      let requestUrl;
      server.use(
        http.get(`${API_BASE_URL}/events/event-1/rundown/report`, ({ request }) => {
          requestUrl = new URL(request.url);
          return new HttpResponse("fake-pdf-bytes", {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": 'attachment; filename="event-rundown.pdf"',
            },
          });
        }),
      );

      render(<EventRundown event={EVENT} />);
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: "Generate Report" }));

      await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
      expect(requestUrl.searchParams.get("format")).toBe("pdf");
    });
  });
});
