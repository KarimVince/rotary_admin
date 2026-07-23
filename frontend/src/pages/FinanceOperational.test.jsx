import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import { currentRotaryYear } from "../utils/rotaryYear";
import FinanceOperational from "./FinanceOperational";

let permissionsByKey = {};
vi.mock("../hooks/useAccess", () => ({
  useAccess: (key) => permissionsByKey[key] ?? { canRead: true, canWrite: true },
}));

const API_BASE_URL = "http://localhost:8000/api/v1";
const THIS_YEAR = currentRotaryYear();

const CATEGORIES = [
  { id: "cat-revenue-1", name: "Ticket Sales", type: "revenue", sort_order: 0, is_active: true, created_at: "2026-01-01T00:00:00Z" },
  { id: "cat-cost-1", name: "Venue Rental", type: "cost", sort_order: 0, is_active: true, created_at: "2026-01-01T00:00:00Z" },
];

const SUMMARY = {
  rotary_year: THIS_YEAR,
  revenue: [
    {
      id: "entry-1",
      category_name: "Ticket Sales",
      amount: 400,
      entry_date: `${THIS_YEAR}-08-01`,
      notes: null,
      source: "manual",
      editable: true,
    },
    {
      id: null,
      category_name: "Member Fees",
      amount: 500,
      entry_date: null,
      notes: null,
      source: "member_fees",
      editable: false,
    },
  ],
  cost: [
    {
      id: null,
      category_name: "Charity Ball",
      amount: 1200,
      entry_date: `${THIS_YEAR}-09-01`,
      notes: null,
      source: "event",
      editable: false,
    },
  ],
  total_revenue: 900,
  total_cost: 1200,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/finance/operational"]}>
      <Routes>
        <Route path="/finance/operational" element={<FinanceOperational />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
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

describe("FinanceOperational", () => {
  beforeEach(() => {
    permissionsByKey = {};
    server.use(http.get(`${API_BASE_URL}/rotary-years`, () => HttpResponse.json(ROTARY_YEARS)));
  });

  it("renders revenue and cost columns with totals, including auto rows", async () => {
    server.use(
      http.get(`${API_BASE_URL}/finance/operational-summary`, () => HttpResponse.json(SUMMARY)),
      http.get(`${API_BASE_URL}/finance-categories`, () => HttpResponse.json(CATEGORIES)),
    );

    renderPage();
    await waitForLoaded();

    expect(screen.getByText("900 HKD")).toBeInTheDocument();
    expect(screen.getAllByText("1,200 HKD").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Member Fees").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Charity Ball").length).toBeGreaterThan(0);
    // Auto rows have no Edit/Delete buttons
    expect(screen.queryAllByRole("button", { name: /^edit$/i })).toHaveLength(1);
    expect(screen.queryAllByRole("button", { name: /^delete$/i })).toHaveLength(1);
  });

  it("adds a new manual entry", async () => {
    server.use(
      http.get(`${API_BASE_URL}/finance/operational-summary`, () =>
        HttpResponse.json({ ...SUMMARY, revenue: [], cost: [], total_revenue: 0, total_cost: 0 }),
      ),
      http.get(`${API_BASE_URL}/finance-categories`, () => HttpResponse.json(CATEGORIES)),
      http.post(`${API_BASE_URL}/operational-entries`, async ({ request }) => {
        const body = await request.json();
        return HttpResponse.json(
          {
            id: "new-entry",
            rotary_year: THIS_YEAR,
            source: "manual",
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
    await waitForLoaded();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Category"), "cat-revenue-1");
    await user.type(screen.getByLabelText("Amount (HKD)"), "250");
    await user.type(screen.getByLabelText("Date"), "2026-08-10");
    await user.click(screen.getByRole("button", { name: /add entry/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /add entry/i })).not.toBeDisabled(),
    );
  });

  it("shows a permission message when the user cannot read Club Operational Tracking", async () => {
    permissionsByKey = {
      "finance.operational": { canRead: false, canWrite: false },
    };

    renderPage();

    expect(
      await screen.findByText("You do not have permission to view Club Operational Tracking."),
    ).toBeInTheDocument();
  });
});
