import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../context/ThemeContext";
import { server } from "../test/mocks/server";
import { currentRotaryYear } from "../utils/rotaryYear";
import DonationsStatistics from "./DonationsStatistics";

vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: true, canWrite: true }),
}));

function renderPage() {
  return render(
    <ThemeProvider>
      <DonationsStatistics />
    </ThemeProvider>,
  );
}

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
      // Story 16.35
      planned_by_rotary_year: [{ label: String(THIS_YEAR), value: 250 }],
    },
  ],
  selected_rotary_year: THIS_YEAR,
  selected_year_organisations_count: 2,
  // Story 16.35 follow-up: "Organisations supported" includes planned-only
  // orgs too — deliberately different from the actual-only count above, to
  // prove the page renders the *_with_planned field, not the actual-only one.
  selected_year_organisations_count_with_planned: 3,
  selected_year: SELECTED_YEAR_FIXTURE,
  all_time_organisations_count: 3,
  all_time_organisations_count_with_planned: 4,
  all_time: ALL_TIME_FIXTURE,
  total_service_hours_all_time: 42,
  total_service_hours_selected_year: 18,
  service_hours_by_rotary_year: [
    { label: String(THIS_YEAR - 1), value: 24 },
    { label: String(THIS_YEAR), value: 18 },
  ],
  // Story 16.35 — planned (not-yet-made) donation total for the selected
  // year, never conflated into selected_year above.
  selected_year_planned: { total_hkd: 250, total_usd: 32, unconverted_count: 0, unconverted_currencies: [] },
};

// recharts' ResponsiveContainer needs real layout dimensions jsdom doesn't
// provide, so we assert on the deterministic surface: the summary card, the
// section headings, and the year-filter callout.
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
  {
    id: "year-prior",
    year: THIS_YEAR - 1,
    label: `${THIS_YEAR - 1}–${THIS_YEAR}`,
    start_date: `${THIS_YEAR - 1}-07-01`,
    end_date: `${THIS_YEAR}-06-30`,
    is_current: false,
    created_at: "2026-01-01T00:00:00Z",
  },
];

describe("DonationsStatistics", () => {
  beforeEach(() => {
    server.use(
      // Story 11.6 — fetched non-fatally on mount for the classification
      // filter; default to empty so existing tests don't need to know about it.
      http.get(`${API_BASE_URL}/ngo-classifications`, () => HttpResponse.json([])),
      // Story 8.32 — fetched non-fatally on mount to gate the "Use annual
      // club template" checkbox; default to "none uploaded".
      http.get(`${API_BASE_URL}/ppt-templates/current`, () => HttpResponse.json(null)),
      // Story 16.28 — the year dropdown now sources its options from the
      // central Rotary Years table.
      http.get(`${API_BASE_URL}/rotary-years`, () => HttpResponse.json(ROTARY_YEARS)),
    );
  });

  it("renders the grand total and section headings from live data", async () => {
    server.use(
      http.get(`${API_BASE_URL}/donations/statistics`, () => HttpResponse.json(STATS)),
    );

    renderPage();

    expect(await screen.findByText("1,300 HKD")).toBeInTheDocument();
    // Story 8.30 — "Top organisations"/"By classification" render once per
    // section (Selected Year + All Years); the multi-year trend charts
    // ("Total donated per rotary year"/"Year-over-year trend") only render
    // in the "All Years" section since they're never actually year-scoped
    // and were redundant duplicated in "Selected Year".
    expect(screen.getAllByText("Total donated per rotary year")).toHaveLength(1);
    expect(screen.getAllByText("Year-over-year trend")).toHaveLength(1);
    expect(screen.getAllByText("Top organisations by total donation")).toHaveLength(2);
  });

  it("shows an error when the statistics request fails", async () => {
    server.use(
      http.get(`${API_BASE_URL}/donations/statistics`, () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 }),
      ),
    );

    renderPage();

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

    renderPage();

    expect(await screen.findByText("1,300 HKD")).toBeInTheDocument();
    expect(screen.getByLabelText("Currency")).toBeInTheDocument();
  });

  it("shows converted all-time and selected-year cards in HKD and USD", async () => {
    server.use(
      http.get(`${API_BASE_URL}/donations/statistics`, () => HttpResponse.json(STATS)),
    );

    renderPage();

    // All-time cards. Story 16.35 follow-up: "Organisations supported"
    // renders the *_with_planned count (4), not the actual-only one (3).
    expect(await screen.findByText("1,300 HKD")).toBeInTheDocument();
    expect(screen.getByText("166 USD")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getAllByText(/organisations supported/i).length).toBeGreaterThan(0);

    // Selected-year cards (HKD only: actual, planned, total).
    expect(screen.getByText("900 HKD")).toBeInTheDocument();
    expect(screen.getByText("250 HKD")).toBeInTheDocument();   // planned donations
    expect(screen.getByText("1,150 HKD")).toBeInTheDocument(); // donated + planned
    // The section heading carries the year; card labels do not — check both separately.
    expect(screen.getByText(`Selected Year — ${THIS_YEAR}–${THIS_YEAR + 1}`)).toBeInTheDocument();
    expect(screen.getAllByText(/Total donated/i).length).toBeGreaterThan(0);
  });

  // Story 16.35 — planned (not-yet-made) donation total shown as an
  // adjacent card, never merged into the actual selected-year total.
  it("shows the planned-donations card alongside the actual selected-year totals", async () => {
    server.use(
      http.get(`${API_BASE_URL}/donations/statistics`, () => HttpResponse.json(STATS)),
    );

    renderPage();

    expect(await screen.findAllByText(/Planned donations/i)).not.toHaveLength(0);
    expect(screen.getByText("250 HKD")).toBeInTheDocument();
    // The actual selected-year total (900) is unaffected by the 250 planned.
    expect(screen.getByText("900 HKD")).toBeInTheDocument();
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

    renderPage();

    expect(await screen.findByText(/3 donations in SGD excluded/i)).toBeInTheDocument();
  });

  // Story 8.26 — when stats return zero data the page must not blank;
  // title, report controls, and year selector all stay visible with zero cards.
  it("keeps the page chrome and shows zero values when no data is available", async () => {
    const EMPTY_STATS = {
      by_currency: [],
      selected_rotary_year: THIS_YEAR,
      selected_year_organisations_count: 0,
      selected_year_organisations_count_with_planned: 0,
      selected_year: {
        total_hkd: 0,
        total_usd: 0,
        unconverted_count: 0,
        unconverted_currencies: [],
      },
      all_time_organisations_count: 0,
      all_time_organisations_count_with_planned: 0,
      all_time: {
        total_hkd: 0,
        total_usd: 0,
        unconverted_count: 0,
        unconverted_currencies: [],
      },
      total_service_hours_all_time: 0,
      total_service_hours_selected_year: 0,
      service_hours_by_rotary_year: [],
      selected_year_planned: { total_hkd: 0, total_usd: 0, unconverted_count: 0, unconverted_currencies: [] },
    };

    server.use(
      http.get(`${API_BASE_URL}/donations/statistics`, () => HttpResponse.json(EMPTY_STATS)),
    );

    renderPage();

    // Page chrome stays fully intact.
    expect(await screen.findByText("Donation statistics")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Format" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View a rotary year" })).toBeInTheDocument();

    // Report cards show zero values rather than disappearing.
    expect(screen.getAllByText("0 HKD").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0 USD").length).toBeGreaterThan(0);
  });

  // Story 8.30 — the page shows "Selected Year" and "All Years" sections,
  // 2 charts per row, with independently-scoped data for the two charts
  // that actually differ by scope (top orgs, by classification).
  it("renders Selected Year and All Years sections with independently scoped data", async () => {
    server.use(
      http.get(`${API_BASE_URL}/donations/statistics`, () => HttpResponse.json(STATS)),
    );

    renderPage();
    await screen.findByText("1,300 HKD");

    expect(screen.getByText(`Selected Year — ${THIS_YEAR}–${THIS_YEAR + 1}`)).toBeInTheDocument();
    expect(screen.getByText("All Years")).toBeInTheDocument();

    // "Top organisations" differs: Selected Year only has Beta (700); All
    // Years has both Beta (800) and Alpha (500) from the fixture. Per this
    // file's convention (see the comment above the describe block), we
    // don't assert on chart-internal rendered labels (jsdom can't lay out
    // recharts' SVG) — the heading rendering twice, once per section, is
    // the deterministic signal that both differently-scoped charts mounted.
    expect(screen.getAllByText("Top organisations by total donation")).toHaveLength(2);

    // "By classification" differs too: two distinct chart headings, one
    // per section.
    expect(
      screen.getByText(`By classification — ${THIS_YEAR}–${THIS_YEAR + 1}`),
    ).toBeInTheDocument();
    expect(screen.getByText("By classification — All years")).toBeInTheDocument();
  });

  describe("Generate Report (Story 8.32)", () => {
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

    it("downloads a Project Services PDF for the selected year when Generate Report is clicked", async () => {
      let requestUrl;
      server.use(
        http.get(`${API_BASE_URL}/donations/statistics`, () => HttpResponse.json(STATS)),
        http.post(`${API_BASE_URL}/donations/statistics/report`, ({ request }) => {
          requestUrl = new URL(request.url);
          return new HttpResponse("fake-pdf-bytes", {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": 'attachment; filename="ngo-statistics.pdf"',
            },
          });
        }),
      );

      renderPage();
      await screen.findByText("1,300 HKD");

      // PDF (Project Services) is the default format — click Generate Report directly.
      await userEvent.click(screen.getByRole("button", { name: /generate report/i }));

      await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
      expect(requestUrl.searchParams.get("format")).toBe("pdf");
      expect(requestUrl.searchParams.get("type")).toBe("project-services");
      expect(requestUrl.searchParams.get("rotary_year")).toBe(String(THIS_YEAR));
      expect(requestUrl.searchParams.get("currency")).toBe("HKD");
    });

    it("shows an error message when report generation fails", async () => {
      server.use(
        http.get(`${API_BASE_URL}/donations/statistics`, () => HttpResponse.json(STATS)),
        http.post(`${API_BASE_URL}/donations/statistics/report`, () =>
          HttpResponse.json({ detail: "No data to report" }, { status: 400 }),
        ),
      );

      renderPage();
      await screen.findByText("1,300 HKD");

      await userEvent.click(screen.getByRole("button", { name: /generate report/i }));

      expect(await screen.findByText("No data to report")).toBeInTheDocument();
    });
  });

  describe("Volunteer service hours (Story 16.14)", () => {
    it("shows the all-time and selected-year hours cards, and the hours chart heading", async () => {
      server.use(
        http.get(`${API_BASE_URL}/donations/statistics`, () => HttpResponse.json(STATS)),
      );

      renderPage();
      await screen.findByText("1,300 HKD");

      expect(screen.getByText("42 h")).toBeInTheDocument();
      expect(screen.getByText("18 h")).toBeInTheDocument();
      expect(screen.getByText(/volunteer service hours \(all-time\)/i)).toBeInTheDocument();
      // The "Selected Year" section heading carries the year; the card label
      // just says "Volunteer service hours" — both are on the page.
      expect(screen.getAllByText(/volunteer service hours/i).length).toBeGreaterThan(0);
      expect(screen.getByText("Volunteer service hours per rotary year")).toBeInTheDocument();
    });
  });
});
