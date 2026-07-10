import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import { currentRotaryYear } from "../utils/rotaryYear";
import FeeSettingsManagement from "./FeeSettingsManagement";

const API_BASE_URL = "http://localhost:8000/api/v1";
const YEAR = currentRotaryYear();

const BASE_SETTINGS = {
  id: "fee-1",
  rotary_year: YEAR,
  early_bird_single_price: 500,
  early_bird_couple_price: 900,
  full_single_price: 600,
  full_couple_price: 1000,
  currency: "HKD",
  created_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

let mockCanRead = true;
let mockCanWrite = true;
vi.mock("../hooks/useAccess", () => ({
  // Story 12.5: both read and write checks now resolve against the single
  // fees.settings key.
  useAccess: () => ({ canRead: mockCanRead, canWrite: mockCanWrite }),
}));

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
}

describe("FeeSettingsManagement", () => {
  it("loads and displays existing prices for the selected year", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    server.use(
      http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([BASE_SETTINGS])),
      http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, () => HttpResponse.json(BASE_SETTINGS)),
    );

    render(<FeeSettingsManagement />);
    await waitForLoaded();

    expect(screen.getByLabelText(/early bird — single/i)).toHaveValue(500);
    expect(screen.getByRole("button", { name: /update prices/i })).toBeInTheDocument();
  });

  it("shows a create form when no settings exist yet for the year", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    server.use(
      http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, () =>
        HttpResponse.json({ detail: "No fee settings found" }, { status: 404 }),
      ),
    );

    render(<FeeSettingsManagement />);
    await waitForLoaded();

    expect(screen.getByLabelText(/early bird — single/i)).toHaveValue(null);
    expect(screen.getByRole("button", { name: /save prices/i })).toBeInTheDocument();
  });

  it("creates fee settings for a year that has none yet", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    let created = null;
    server.use(
      http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json(created ? [created] : [])),
      http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, () =>
        created
          ? HttpResponse.json(created)
          : HttpResponse.json({ detail: "No fee settings found" }, { status: 404 }),
      ),
      http.post(`${API_BASE_URL}/fee-settings`, async ({ request }) => {
        const body = await request.json();
        created = { ...BASE_SETTINGS, ...body };
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    render(<FeeSettingsManagement />);
    await waitForLoaded();

    await userEvent.type(screen.getByLabelText(/early bird — single/i), "500");
    await userEvent.type(screen.getByLabelText(/early bird — couple/i), "900");
    await userEvent.type(screen.getByLabelText(/full — single/i), "600");
    await userEvent.type(screen.getByLabelText(/full — couple/i), "1000");
    await userEvent.click(screen.getByRole("button", { name: /save prices/i }));

    expect(await screen.findByText(/fee settings saved/i)).toBeInTheDocument();
  });

  it("updates existing fee settings for the year", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    let settings = { ...BASE_SETTINGS };
    server.use(
      http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([settings])),
      http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, () => HttpResponse.json(settings)),
      http.patch(`${API_BASE_URL}/fee-settings/${YEAR}`, async ({ request }) => {
        settings = { ...settings, ...(await request.json()) };
        return HttpResponse.json(settings);
      }),
    );

    render(<FeeSettingsManagement />);
    await waitForLoaded();

    const fullCoupleInput = screen.getByLabelText(/full — couple/i);
    await userEvent.clear(fullCoupleInput);
    await userEvent.type(fullCoupleInput, "1200");
    await userEvent.click(screen.getByRole("button", { name: /update prices/i }));

    expect(await screen.findByText(/fee settings saved/i)).toBeInTheDocument();
  });

  it("shows an error when saving fails", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    server.use(
      http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, () =>
        HttpResponse.json({ detail: "No fee settings found" }, { status: 404 }),
      ),
      http.post(`${API_BASE_URL}/fee-settings`, () =>
        HttpResponse.json({ detail: "Fee settings for rotary year already exist" }, { status: 409 }),
      ),
    );

    render(<FeeSettingsManagement />);
    await waitForLoaded();

    await userEvent.type(screen.getByLabelText(/early bird — single/i), "500");
    await userEvent.type(screen.getByLabelText(/early bird — couple/i), "900");
    await userEvent.type(screen.getByLabelText(/full — single/i), "600");
    await userEvent.type(screen.getByLabelText(/full — couple/i), "1000");
    await userEvent.click(screen.getByRole("button", { name: /save prices/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/already exist/i);
  });

  it("does not list future rotary years by default", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    server.use(
      http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, () =>
        HttpResponse.json({ detail: "No fee settings found" }, { status: 404 }),
      ),
    );

    render(<FeeSettingsManagement />);
    await waitForLoaded();

    const options = screen
      .getByLabelText(/rotary year/i)
      .querySelectorAll("option")
      .values();
    const years = Array.from(options).map((option) => Number(option.value));
    expect(years.every((year) => year <= YEAR)).toBe(true);
  });

  it("adds a year to the selector via the Add year form", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    const futureYear = YEAR + 1;
    server.use(
      http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, () =>
        HttpResponse.json({ detail: "No fee settings found" }, { status: 404 }),
      ),
      http.get(`${API_BASE_URL}/fee-settings/${futureYear}`, () =>
        HttpResponse.json({ detail: "No fee settings found" }, { status: 404 }),
      ),
    );

    render(<FeeSettingsManagement />);
    await waitForLoaded();

    await userEvent.type(screen.getByLabelText(/add a year to this list/i), String(futureYear));
    await userEvent.click(screen.getByRole("button", { name: /add year/i }));

    expect(screen.getByLabelText(/rotary year/i)).toHaveValue(String(futureYear));
  });

  it("denies access for a user with no invoices.view access", async () => {
    mockCanRead = false;
    mockCanWrite = false;

    render(<FeeSettingsManagement />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/do not have permission/i);
    expect(screen.queryByLabelText(/early bird — single/i)).not.toBeInTheDocument();
  });

  it("shows prices read-only for a user with view but not manage access", async () => {
    mockCanRead = true;
    mockCanWrite = false;
    server.use(
      http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([BASE_SETTINGS])),
      http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, () => HttpResponse.json(BASE_SETTINGS)),
    );

    render(<FeeSettingsManagement />);
    await waitForLoaded();

    expect(screen.getByLabelText(/early bird — single/i)).toBeDisabled();
    expect(screen.queryByRole("button", { name: /update prices/i })).not.toBeInTheDocument();
  });
});
