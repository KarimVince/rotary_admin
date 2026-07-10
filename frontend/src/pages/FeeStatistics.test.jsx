import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import { currentRotaryYear } from "../utils/rotaryYear";
import FeeStatistics from "./FeeStatistics";

const API_BASE_URL = "http://localhost:8000/api/v1";
const YEAR = currentRotaryYear();

const STATS = {
  rotary_year: YEAR,
  currency: "HKD",
  total_members: 3,
  paid_count: 2,
  unpaid_count: 1,
  total_collected: 1100,
  total_outstanding: 500,
  collection_rate: 68.75,
  breakdown_by_price_type: [
    { price_type: "early_bird", count: 2, total_amount: 1000 },
    { price_type: "full", count: 1, total_amount: 600 },
  ],
};

let mockCanRead = true;
vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: mockCanRead, canWrite: mockCanRead }),
}));

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
}

describe("FeeStatistics", () => {
  it("shows collected, outstanding, and collection rate for the selected year", async () => {
    mockCanRead = true;
    server.use(
      http.get(`${API_BASE_URL}/member-fees/statistics`, () => HttpResponse.json(STATS)),
      http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
    );

    render(<FeeStatistics />);
    await waitForLoaded();

    expect(screen.getByText("1,100 HKD")).toBeInTheDocument();
    expect(screen.getByText("500 HKD")).toBeInTheDocument();
    expect(screen.getByText("68.8%")).toBeInTheDocument();
  });

  it("includes years configured in Fee settings in the year selector, not just current/current-1", async () => {
    mockCanRead = true;
    const distantYear = YEAR - 5;
    server.use(
      http.get(`${API_BASE_URL}/member-fees/statistics`, () => HttpResponse.json(STATS)),
      http.get(`${API_BASE_URL}/fee-settings`, () =>
        HttpResponse.json([{ rotary_year: distantYear, currency: "HKD" }]),
      ),
    );

    render(<FeeStatistics />);
    await waitForLoaded();

    const options = Array.from(
      screen.getByLabelText(/rotary year/i).querySelectorAll("option"),
    ).map((option) => Number(option.value));
    expect(options).toContain(distantYear);
  });

  it("denies access for a user without invoices.view access", async () => {
    mockCanRead = false;
    render(<FeeStatistics />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/do not have permission/i);
  });
});
