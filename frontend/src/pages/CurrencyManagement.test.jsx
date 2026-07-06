import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import CurrencyManagement from "./CurrencyManagement";

const API_BASE_URL = "http://localhost:8000/api/v1";

const BASE_RATE = {
  id: "rate-1",
  currency_code: "HKD",
  rate_to_hkd: 1,
  rate_to_usd: 0.128,
  updated_by: null,
  updated_at: new Date().toISOString(),
};

let mockRole = "admin";
vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ user: { role: mockRole } }),
}));

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
}

describe("CurrencyManagement", () => {
  it("lists exchange rates fetched from the API", async () => {
    mockRole = "admin";
    server.use(
      http.get(`${API_BASE_URL}/exchange-rates`, () => HttpResponse.json([BASE_RATE])),
    );

    render(<CurrencyManagement />);

    expect(await screen.findByText("HKD")).toBeInTheDocument();
  });

  it("creates a new currency rate and refreshes the list", async () => {
    mockRole = "admin";
    let rates = [BASE_RATE];
    server.use(
      http.get(`${API_BASE_URL}/exchange-rates`, () => HttpResponse.json(rates)),
      http.post(`${API_BASE_URL}/exchange-rates`, async ({ request }) => {
        const body = await request.json();
        const created = { ...BASE_RATE, id: "rate-2", ...body };
        rates = [...rates, created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    render(<CurrencyManagement />);
    await waitForLoaded();

    await userEvent.selectOptions(screen.getByLabelText(/currency/i), "EUR");
    await userEvent.type(screen.getByLabelText(/rate to hkd/i), "8.5");
    await userEvent.type(screen.getByLabelText(/rate to usd/i), "1.09");
    await userEvent.click(screen.getByRole("button", { name: /add rate/i }));

    expect(await screen.findByText("EUR")).toBeInTheDocument();
  });

  it("shows an error when creation fails", async () => {
    mockRole = "admin";
    server.use(
      http.get(`${API_BASE_URL}/exchange-rates`, () => HttpResponse.json([BASE_RATE])),
      http.post(`${API_BASE_URL}/exchange-rates`, () =>
        HttpResponse.json(
          { detail: "A rate already exists for this currency — update it instead" },
          { status: 409 },
        ),
      ),
    );

    render(<CurrencyManagement />);
    await waitForLoaded();

    await userEvent.selectOptions(screen.getByLabelText(/currency/i), "EUR");
    await userEvent.type(screen.getByLabelText(/rate to hkd/i), "8.5");
    await userEvent.type(screen.getByLabelText(/rate to usd/i), "1.09");
    await userEvent.click(screen.getByRole("button", { name: /add rate/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/already exists/i);
  });

  it("edits an existing rate via the same form", async () => {
    mockRole = "admin";
    let rate = { ...BASE_RATE };
    server.use(
      http.get(`${API_BASE_URL}/exchange-rates`, () => HttpResponse.json([rate])),
      http.patch(`${API_BASE_URL}/exchange-rates/${BASE_RATE.id}`, async ({ request }) => {
        rate = { ...rate, ...(await request.json()) };
        return HttpResponse.json(rate);
      }),
    );

    render(<CurrencyManagement />);
    await screen.findByText("HKD");

    await userEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    const hkdInput = screen.getByLabelText(/rate to hkd/i);
    await userEvent.clear(hkdInput);
    await userEvent.type(hkdInput, "1");
    const usdInput = screen.getByLabelText(/rate to usd/i);
    await userEvent.clear(usdInput);
    await userEvent.type(usdInput, "0.13");
    await userEvent.click(screen.getByRole("button", { name: /update rate/i }));

    expect(await screen.findByText("0.13")).toBeInTheDocument();
  });

  it("deletes a rate after confirmation", async () => {
    mockRole = "admin";
    let rates = [BASE_RATE];
    vi.spyOn(window, "confirm").mockReturnValue(true);
    server.use(
      http.get(`${API_BASE_URL}/exchange-rates`, () => HttpResponse.json(rates)),
      http.delete(`${API_BASE_URL}/exchange-rates/${BASE_RATE.id}`, () => {
        rates = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );

    render(<CurrencyManagement />);
    await screen.findByText("HKD");

    await userEvent.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => expect(screen.queryByText("HKD")).not.toBeInTheDocument());
  });

  it("hides the management form for non-admin, non-treasurer users", async () => {
    mockRole = "user";
    server.use(
      http.get(`${API_BASE_URL}/exchange-rates`, () => HttpResponse.json([BASE_RATE])),
    );

    render(<CurrencyManagement />);
    await waitForLoaded();

    expect(screen.queryByLabelText(/rate to hkd/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
  });
});
