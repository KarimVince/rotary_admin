import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import { currentRotaryYear } from "../utils/rotaryYear";
import FinanceDonations from "./FinanceDonations";

let permissionsByKey = {};
vi.mock("../hooks/useAccess", () => ({
  useAccess: (key) => permissionsByKey[key] ?? { canRead: true, canWrite: true },
}));

function renderFinanceDonations() {
  return render(
    <MemoryRouter initialEntries={["/finance/donations"]}>
      <Routes>
        <Route path="/finance/donations" element={<FinanceDonations />} />
      </Routes>
    </MemoryRouter>,
  );
}

const API_BASE_URL = "http://localhost:8000/api/v1";
const THIS_YEAR = currentRotaryYear();

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

const ORGANISATIONS = [
  { id: "org-1", name: "Alpha NGO", year_total: 500 },
  { id: "org-2", name: "Beta NGO", year_total: 300 },
];

const DONATIONS = [
  {
    id: "don-1",
    organisation_id: "org-1",
    rotary_year: THIS_YEAR,
    amount: 500,
    currency: "HKD",
    donation_date: `${THIS_YEAR}-08-01`,
    notes: "Annual gift",
    created_by: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  },
  {
    id: "don-2",
    organisation_id: "org-2",
    rotary_year: THIS_YEAR,
    amount: 300,
    currency: "HKD",
    donation_date: `${THIS_YEAR}-09-01`,
    notes: null,
    created_by: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
  },
];

const STATS = {
  by_currency: [],
  selected_rotary_year: THIS_YEAR,
  selected_year_organisations_count: 2,
  selected_year: { total_hkd: 800, total_usd: 102.4, unconverted_count: 0, unconverted_currencies: [] },
  all_time_organisations_count: 2,
  all_time: { total_hkd: 800, total_usd: 102.4, unconverted_count: 0, unconverted_currencies: [] },
  total_service_hours_all_time: 0,
  total_service_hours_selected_year: 0,
  service_hours_by_rotary_year: [],
};

describe("FinanceDonations", () => {
  beforeEach(() => {
    permissionsByKey = {};
  });

  it("renders the Donation Results recap grouped by organisation", async () => {
    server.use(
      http.get(`${API_BASE_URL}/rotary-years`, () => HttpResponse.json(ROTARY_YEARS)),
      http.get(`${API_BASE_URL}/organisations`, () => HttpResponse.json(ORGANISATIONS)),
      http.get(`${API_BASE_URL}/donations`, () => HttpResponse.json(DONATIONS)),
      http.get(`${API_BASE_URL}/donations/statistics`, () => HttpResponse.json(STATS)),
    );

    renderFinanceDonations();

    expect(await screen.findByText("Alpha NGO")).toBeInTheDocument();
    expect(screen.getByText("Beta NGO")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("800 HKD")).toBeInTheDocument();
    expect(screen.getByText("Annual gift")).toBeInTheDocument();
  });

  it("shows a permission message when the user cannot read Donation Results", async () => {
    server.use(http.get(`${API_BASE_URL}/rotary-years`, () => HttpResponse.json(ROTARY_YEARS)));
    permissionsByKey = {
      "finance.donations": { canRead: false, canWrite: false },
    };

    renderFinanceDonations();

    expect(
      await screen.findByText("You do not have permission to view Donation Results."),
    ).toBeInTheDocument();
  });
});
