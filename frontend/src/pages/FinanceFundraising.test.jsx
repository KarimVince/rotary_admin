import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import { currentRotaryYear } from "../utils/rotaryYear";
import FinanceFundraising from "./FinanceFundraising";

let permissionsByKey = {};
vi.mock("../hooks/useAccess", () => ({
  useAccess: (key) => permissionsByKey[key] ?? { canRead: true, canWrite: true },
}));

const API_BASE_URL = "http://localhost:8000/api/v1";
const THIS_YEAR = currentRotaryYear();

const SUMMARY = {
  rotary_year: THIS_YEAR,
  events: [
    {
      event_id: "event-1",
      event_name: "Annual Gala",
      event_date: `${THIS_YEAR}-09-01`,
      auction_total: 1200,
      lucky_draw_total: 500,
      other_donation_total: 100,
      total: 1800,
    },
  ],
  event_fundraising_total: 1800,
  adhoc_donations_total: 200,
  combined_total: 2000,
};

const ADHOC_DONATIONS = [
  {
    id: "adhoc-1",
    rotary_year: THIS_YEAR,
    donation_date: `${THIS_YEAR}-08-01`,
    description: "Red box collection",
    amount: 200,
    created_by: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/finance/fundraising"]}>
      <Routes>
        <Route path="/finance/fundraising" element={<FinanceFundraising />} />
      </Routes>
    </MemoryRouter>,
  );
}

const ROTARY_YEARS = [
  {
    id: "year-this",
    year: THIS_YEAR,
    label: `${THIS_YEAR}–${THIS_YEAR + 1}`,
    start_date: `${THIS_YEAR}-07-01`,
    end_date: `${THIS_YEAR + 1}-06-30`,
    is_current: true,
    created_at: "2026-01-01T00:00:00Z",
  },
];

describe("FinanceFundraising", () => {
  beforeEach(() => {
    permissionsByKey = {};
    server.use(http.get(`${API_BASE_URL}/rotary-years`, () => HttpResponse.json(ROTARY_YEARS)));
  });

  it("renders event fundraising recap and ad hoc donations combined total", async () => {
    server.use(
      http.get(`${API_BASE_URL}/finance/fundraising-summary`, () => HttpResponse.json(SUMMARY)),
      http.get(`${API_BASE_URL}/adhoc-donations`, () => HttpResponse.json(ADHOC_DONATIONS)),
    );

    renderPage();

    expect(await screen.findByText("Annual Gala")).toBeInTheDocument();
    expect(screen.getByText("Red box collection")).toBeInTheDocument();
    expect(screen.getByText("2,000 HKD")).toBeInTheDocument();
  });

  it("adds a new ad hoc donation", async () => {
    server.use(
      http.get(`${API_BASE_URL}/finance/fundraising-summary`, () =>
        HttpResponse.json({ ...SUMMARY, events: [], event_fundraising_total: 0, adhoc_donations_total: 0, combined_total: 0 }),
      ),
      http.get(`${API_BASE_URL}/adhoc-donations`, () => HttpResponse.json([])),
      http.post(`${API_BASE_URL}/adhoc-donations`, async ({ request }) => {
        const body = await request.json();
        return HttpResponse.json(
          {
            id: "new-adhoc",
            rotary_year: THIS_YEAR,
            created_by: null,
            created_at: "2026-08-01T00:00:00Z",
            updated_at: "2026-08-01T00:00:00Z",
            ...body,
          },
          { status: 201 },
        );
      }),
    );

    renderPage();
    await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Date"), "2026-08-15");
    await user.type(screen.getByLabelText("Description / source"), "Dinner collection");
    await user.type(screen.getByLabelText("Amount (HKD)"), "150");
    await user.click(screen.getByRole("button", { name: /add donation/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /add donation/i })).not.toBeDisabled(),
    );
  });

  it("shows a permission message when the user cannot read Fund Raising Results", async () => {
    permissionsByKey = {
      "finance.fundraising": { canRead: false, canWrite: false },
    };

    renderPage();

    expect(
      await screen.findByText("You do not have permission to view Fund Raising Results."),
    ).toBeInTheDocument();
  });
});
