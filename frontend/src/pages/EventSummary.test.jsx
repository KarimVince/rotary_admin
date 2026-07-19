import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import EventSummary from "./EventSummary";

const API_BASE_URL = "http://localhost:8000/api/v1";

let mockCanRead = true;
vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: mockCanRead, canWrite: mockCanRead }),
}));

const EVENT = { id: "event-1", name: "Gala", date: "2026-08-15", created_at: new Date().toISOString() };

const SUMMARY = {
  total_raised: 7500,
  auction_total: 2000,
  lucky_draw_total: 5000,
  other_donation: 500,
  total_revenue: 3900,
  ticket_revenue: 900,
  sponsor_revenue: 3000,
  total_cost: 100,
  cost_per_category: [{ label: "Decoration", value: 100 }],
  net_operational_result: 3800,
  revenue_breakdown: [
    { label: "Ticket Revenue", value: 900 },
    { label: "Sponsor Revenue", value: 3000 },
    { label: "Fundraising Total", value: 7500 },
  ],
  cost_breakdown: [{ label: "Decoration", value: 100 }],
  result_overview: [
    { label: "Revenue", value: 3900 },
    { label: "Total Cost", value: 100 },
    { label: "Net Result", value: 3800 },
  ],
};

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
  await waitFor(() => expect(screen.queryByText(/loading summary…/i)).not.toBeInTheDocument());
}

describe("EventSummary", () => {
  beforeEach(() => {
    mockCanRead = true;
    server.use(
      http.get(`${API_BASE_URL}/events/event-1/summary`, () => HttpResponse.json(SUMMARY)),
    );
  });

  it("denies access without events.summary read", async () => {
    mockCanRead = false;
    render(<EventSummary event={EVENT} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/do not have permission/i);
  });

  it("shows all four card sections with correct computed values", async () => {
    render(<EventSummary event={EVENT} />);
    await waitForLoaded();

    expect(screen.getByText("Fundraising Results")).toBeInTheDocument();
    expect(
      screen.getByText("Total Raised", { selector: ".summary-card-label" }).closest(".summary-card"),
    ).toHaveTextContent("HKD 7,500");

    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(
      screen.getByText("Total Revenue", { selector: ".summary-card-label" }).closest(".summary-card"),
    ).toHaveTextContent("HKD 3,900");

    expect(screen.getByText("Operational Cost")).toBeInTheDocument();
    expect(
      screen.getByText("Decoration", { selector: ".summary-card-label" }).closest(".summary-card"),
    ).toHaveTextContent("HKD 100");

    expect(screen.getByText("Operational Result")).toBeInTheDocument();
    expect(
      screen
        .getByText("Net Operational Result", { selector: ".summary-card-label" })
        .closest(".summary-card"),
    ).toHaveTextContent("HKD 3,800");
  });

  it("renders the three breakdown charts", async () => {
    render(<EventSummary event={EVENT} />);
    await waitForLoaded();

    expect(screen.getByText("Income breakdown")).toBeInTheDocument();
    expect(screen.getByText("Cost breakdown")).toBeInTheDocument();
    expect(screen.getByText("Result overview")).toBeInTheDocument();
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

    it("downloads the summary report with the selected format", async () => {
      let requestUrl;
      server.use(
        http.get(`${API_BASE_URL}/events/event-1/summary/report`, ({ request }) => {
          requestUrl = new URL(request.url);
          return new HttpResponse("fake-pdf-bytes", {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": 'attachment; filename="event-summary.pdf"',
            },
          });
        }),
      );

      render(<EventSummary event={EVENT} />);
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: "Generate Report" }));

      await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
      expect(requestUrl.searchParams.get("format")).toBe("pdf");
    });
  });
});
