import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import { currentRotaryYear } from "../utils/rotaryYear";
import DonationsStatistics from "./DonationsStatistics";

vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: true, canWrite: true }),
}));

const API_BASE_URL = "http://localhost:8000/api/v1";
const THIS_YEAR = currentRotaryYear();

const ALL_TIME_FIXTURE = {
  total_hkd: 1300,
  total_usd: 166.4,
  unconverted_count: 0,
  unconverted_currencies: [],
};

const SELECTED_YEAR_FIXTURE = {
  total_hkd: 900,
  total_usd: 115.2,
  unconverted_count: 0,
  unconverted_currencies: [],
};

const STATS = {
  by_currency: [
    {
      currency: "HKD",
      total_by_rotary_year: [
        { label: String(THIS_YEAR - 1), value: 400 },
        { label: String(THIS_YEAR), value: 900 },
      ],
      total_by_organisation: [
        { label: "Beta", value: 800 },
        { label: "Alpha", value: 500 },
      ],
      organisations_by_rotary_year: [
        { label: String(THIS_YEAR - 1), value: 1 },
        { label: String(THIS_YEAR), value: 2 },
      ],
      grand_total: 1300,
      total_by_classification: [{ label: "Unclassified", value: 900 }],
    },
  ],
  selected_rotary_year: THIS_YEAR,
  selected_year_organisations_count: 2,
  selected_year: SELECTED_YEAR_FIXTURE,
  all_time_organisations_count: 3,
  all_time: ALL_TIME_FIXTURE,
};

// recharts' ResponsiveContainer needs real layout dimensions jsdom doesn't
// provide, so we assert on the deterministic surface: the summary card, the
// section headings, and the year-filter callout.
describe("DonationsStatistics", () => {
  beforeEach(() => {
    server.use(
      // Story 11.6 — fetched non-fatally on mount for the classification
      // filter; default to empty so existing tests don't need to know about it.
      http.get(`${API_BASE_URL}/ngo-classifications`, () => HttpResponse.json([])),
    );
  });

  it("renders the grand total and section headings from live data", async () => {
    server.use(
      http.get(`${API_BASE_URL}/donations/statistics`, () => HttpResponse.json(STATS)),
    );

    render(<DonationsStatistics />);

    expect(await screen.findByText("1,300 HKD")).toBeInTheDocument();
    expect(screen.getByText("Total donated per rotary year")).toBeInTheDocument();
    expect(screen.getByText("Year-over-year trend")).toBeInTheDocument();
    expect(screen.getByText("Top organisations by total donation")).toBeInTheDocument();
  });

  it("shows an error when the statistics request fails", async () => {
    server.use(
      http.get(`${API_BASE_URL}/donations/statistics`, () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 }),
      ),
    );

    render(<DonationsStatistics />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/server error/i);
  });

  it("keeps currency totals separate and lets the user switch currencies", async () => {
    server.use(
      http.get(`${API_BASE_URL}/donations/statistics`, () =>
        HttpResponse.json({
          ...STATS,
          by_currency: [
            ...STATS.by_currency,
            {
              currency: "USD",
              total_by_rotary_year: [{ label: String(THIS_YEAR), value: 200 }],
              total_by_organisation: [{ label: "Gamma", value: 200 }],
              organisations_by_rotary_year: [{ label: String(THIS_YEAR), value: 1 }],
              grand_total: 200,
              total_by_classification: [{ label: "Unclassified", value: 200 }],
            },
          ],
        }),
      ),
    );

    render(<DonationsStatistics />);

    expect(await screen.findByText("1,300 HKD")).toBeInTheDocument();
    expect(screen.getByLabelText("Currency")).toBeInTheDocument();
  });

  it("shows converted all-time and selected-year cards in HKD and USD", async () => {
    server.use(
      http.get(`${API_BASE_URL}/donations/statistics`, () => HttpResponse.json(STATS)),
    );

    render(<DonationsStatistics />);

    // All-time cards.
    expect(await screen.findByText("1,300 HKD")).toBeInTheDocument();
    expect(screen.getByText("166 USD")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getAllByText(/organisations supported/i).length).toBeGreaterThan(0);

    // Selected-year cards.
    expect(screen.getByText("900 HKD")).toBeInTheDocument();
    expect(screen.getByText("115 USD")).toBeInTheDocument();
    expect(
      screen.getAllByText(new RegExp(`Total donated.*${THIS_YEAR}`, "i")).length,
    ).toBeGreaterThan(0);
  });

  it("warns when donations exist in a currency with no exchange rate", async () => {
    server.use(
      http.get(`${API_BASE_URL}/donations/statistics`, () =>
        HttpResponse.json({
          ...STATS,
          selected_year: {
            total_hkd: 100,
            total_usd: 12.8,
            unconverted_count: 3,
            unconverted_currencies: ["SGD"],
          },
        }),
      ),
    );

    render(<DonationsStatistics />);

    expect(await screen.findByText(/3 donations in SGD excluded/i)).toBeInTheDocument();
  });
});
