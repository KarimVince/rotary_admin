import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import { currentRotaryYear } from "../utils/rotaryYear";
import FinanceSummary from "./FinanceSummary";

let permissionsByKey = {};
vi.mock("../hooks/useAccess", () => ({
  useAccess: (key) => permissionsByKey[key] ?? { canRead: true, canWrite: true },
}));

const API_BASE_URL = "http://localhost:8000/api/v1";
const THIS_YEAR = currentRotaryYear();

const SUMMARY = {
  rotary_year: THIS_YEAR,
  total_donations: 1000,
  total_fundraising: 200,
  total_charity: 1200,
  fees_collected: 500,
  total_revenue: 800,
  total_expenses: 400,
  net_balance: 400,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/finance"]}>
      <Routes>
        <Route path="/finance" element={<FinanceSummary />} />
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

describe("FinanceSummary", () => {
  beforeEach(() => {
    permissionsByKey = {};
    server.use(http.get(`${API_BASE_URL}/rotary-years`, () => HttpResponse.json(ROTARY_YEARS)));
  });

  it("renders the two-column charity vs club operational overview", async () => {
    server.use(
      http.get(`${API_BASE_URL}/finance/summary`, () => HttpResponse.json(SUMMARY)),
    );

    renderPage();
    await waitForLoaded();

    expect(screen.getByText("Charity & Donation Results")).toBeInTheDocument();
    expect(screen.getByText("Club Operational Results")).toBeInTheDocument();
    expect(screen.getByText("1,200 HKD")).toBeInTheDocument();
    expect(screen.getByText("1,000 HKD")).toBeInTheDocument();
    expect(screen.getByText("200 HKD")).toBeInTheDocument();
    expect(screen.getByText("500 HKD")).toBeInTheDocument();
    expect(screen.getByText("800 HKD")).toBeInTheDocument();
    // net_balance and total_expenses are both 400 in this fixture
    expect(screen.getAllByText("400 HKD").length).toBe(2);
  });

  it("shows a permission message when the user cannot read the Finance Summary", async () => {
    permissionsByKey = {
      "finance.summary": { canRead: false, canWrite: false },
    };

    renderPage();

    expect(
      await screen.findByText("You do not have permission to view the Finance Summary."),
    ).toBeInTheDocument();
  });
});
