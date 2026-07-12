import { fireEvent, render, screen } from "@testing-library/react";
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
      total_by_organisation_selected_year: [{ label: "Beta", value: 700 }],
      organisations_by_rotary_year: [
        { label: String(THIS_YEAR - 1), value: 1 },
        { label: String(THIS_YEAR), value: 2 },
      ],
      grand_total: 1300,
      total_by_classification: [{ label: "Unclassified", value: 900 }],
      total_by_classification_all_time: [{ label: "Unclassified", value: 1300 }],
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
    // Story 8.30 — each chart type now renders once in "Selected Year" and
    // once in "All Years".
    expect(screen.getAllByText("Total donated per rotary year")).toHaveLength(2);
    expect(screen.getAllByText("Year-over-year trend")).toHaveLength(2);
    expect(screen.getAllByText("Top organisations by total donation")).toHaveLength(2);
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

  // Story 8.26 — selecting a classification with zero matching donations
  // must not blank the page (title/report card/selectors all stay visible).
  it("keeps the page chrome and shows an empty state when a classification has no NGOs", async () => {
    const EMPTY_STATS = {
      by_currency: [],
      selected_rotary_year: THIS_YEAR,
      selected_year_organisations_count: 0,
      selected_year: {
        total_hkd: 0,
        total_usd: 0,
        unconverted_count: 0,
        unconverted_currencies: [],
      },
      all_time_organisations_count: 0,
      all_time: {
        total_hkd: 0,
        total_usd: 0,
        unconverted_count: 0,
        unconverted_currencies: [],
      },
    };

    server.use(
      http.get(`${API_BASE_URL}/ngo-classifications`, () =>
        HttpResponse.json([{ id: "class-1", name: "Environment & Climate" }]),
      ),
      http.get(`${API_BASE_URL}/donations/statistics`, () => HttpResponse.json(EMPTY_STATS)),
    );

    render(<DonationsStatistics />);

    expect(await screen.findByLabelText("Classification")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Classification"), {
      target: { value: "class-1" },
    });

    // Page chrome stays fully intact.
    expect(screen.getByText("Donation statistics")).toBeInTheDocument();
    expect(screen.getByLabelText("Generate report")).toBeInTheDocument();
    expect(screen.getByLabelText("Classification")).toBeInTheDocument();
    expect(screen.getByLabelText("View a rotary year")).toBeInTheDocument();

    // Report cards show zero values rather than disappearing.
    expect(screen.getAllByText("0 HKD").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0 USD").length).toBeGreaterThan(0);

    // Each chart shows the classification-aware empty state — 4 chart types
    // in each of the 2 sections (Story 8.30).
    expect(await screen.findAllByText("No NGOs found for this classification.")).toHaveLength(8);
  });

  // Story 8.30 — the page shows "Selected Year" and "All Years" sections,
  // 2 charts per row, with independently-scoped data for the two charts
  // that actually differ by scope (top orgs, by classification).
  it("renders Selected Year and All Years sections with independently scoped data", async () => {
    server.use(
      http.get(`${API_BASE_URL}/donations/statistics`, () => HttpResponse.json(STATS)),
    );

    render(<DonationsStatistics />);
    await screen.findByText("1,300 HKD");

    expect(screen.getByText(`Selected Year — ${THIS_YEAR}–${THIS_YEAR + 1}`)).toBeInTheDocument();
    expect(screen.getByText("All Years")).toBeInTheDocument();

    // "Top organisations" differs: Selected Year only has Beta (700); All
    // Years has both Beta (800) and Alpha (500) from the fixture.
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    const betaBars = screen.getAllByText("Beta");
    expect(betaBars.length).toBe(2); // one per section

    // "By classification" differs too: two distinct chart headings, one
    // per section.
    expect(
      screen.getByText(`By classification — ${THIS_YEAR}–${THIS_YEAR + 1}`),
    ).toBeInTheDocument();
    expect(screen.getByText("By classification — All years")).toBeInTheDocument();
  });
});
