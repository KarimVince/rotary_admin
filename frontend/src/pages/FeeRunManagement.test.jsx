import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import { currentRotaryYear } from "../utils/rotaryYear";
import FeeRunManagement from "./FeeRunManagement";

const API_BASE_URL = "http://localhost:8000/api/v1";
const YEAR = currentRotaryYear();

const SETTINGS = {
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

const SINGLE_MEMBER = {
  id: "member-1",
  first_name: "Single",
  last_name: "Smith",
  is_couple: false,
  status: "active",
};

const COUPLE_MEMBER = {
  id: "member-2",
  first_name: "Couple",
  last_name: "Jones",
  is_couple: true,
  status: "active",
};

let mockCanManage = true;
vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: mockCanManage, canWrite: mockCanManage }),
}));

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
}

describe("FeeRunManagement", () => {
  it("shows the couple-priced preview amount distinguished from single", async () => {
    mockCanManage = true;
    server.use(
      http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([SINGLE_MEMBER, COUPLE_MEMBER])),
      http.get(`${API_BASE_URL}/fee-runs/${YEAR}`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, () => HttpResponse.json(SETTINGS)),
      http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([SETTINGS])),
    );

    render(<FeeRunManagement />);
    await waitForLoaded();

    expect(screen.getAllByText(/couple/i).length).toBeGreaterThan(0);
    const rows = screen.getAllByRole("row");
    const singleRow = rows.find((row) => row.textContent.includes("Single Smith"));
    const coupleRow = rows.find((row) => row.textContent.includes("Couple Jones"));
    expect(singleRow.textContent).toContain("500 HKD");
    expect(coupleRow.textContent).toContain("900 HKD");
  });

  it("warns when no fee settings exist for the year", async () => {
    mockCanManage = true;
    server.use(
      http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/fee-runs/${YEAR}`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, () =>
        HttpResponse.json({ detail: "No fee settings found" }, { status: 404 }),
      ),
      http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
    );

    render(<FeeRunManagement />);
    await waitForLoaded();

    expect(await screen.findByRole("alert")).toHaveTextContent(/no fee settings configured/i);
  });

  it("generates a fee run and shows the summary", async () => {
    mockCanManage = true;
    server.use(
      http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([SINGLE_MEMBER])),
      http.get(`${API_BASE_URL}/fee-runs/${YEAR}`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, () => HttpResponse.json(SETTINGS)),
      http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([SETTINGS])),
      http.post(`${API_BASE_URL}/fee-runs`, () =>
        HttpResponse.json(
          {
            rotary_year: YEAR,
            price_type: "early_bird",
            created_count: 1,
            updated_count: 0,
            skipped_paid_count: 0,
            member_fees: [
              {
                id: "mf-1",
                member_id: SINGLE_MEMBER.id,
                rotary_year: YEAR,
                price_type: "early_bird",
                is_couple_at_billing: false,
                amount_due: 500,
                is_paid: false,
                paid_date: null,
                invoice_sent_at: null,
                invoice_send_count: 0,
                last_channel: null,
                notes: null,
                created_by: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            ],
          },
          { status: 201 },
        ),
      ),
    );

    render(<FeeRunManagement />);
    await waitForLoaded();

    await userEvent.click(screen.getByRole("button", { name: /generate fee run/i }));

    expect(await screen.findByText(/1 created/i)).toBeInTheDocument();
  });

  it("shows a send confirmation with unpaid and skipped counts, then sends", async () => {
    mockCanManage = true;
    server.use(
      http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([SINGLE_MEMBER, COUPLE_MEMBER])),
      http.get(`${API_BASE_URL}/fee-runs/${YEAR}`, () =>
        HttpResponse.json([
          {
            id: "mf-1",
            member_id: SINGLE_MEMBER.id,
            rotary_year: YEAR,
            price_type: "early_bird",
            is_couple_at_billing: false,
            amount_due: 500,
            is_paid: false,
            paid_date: null,
            invoice_sent_at: null,
            invoice_send_count: 0,
            last_channel: null,
            notes: null,
            created_by: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: "mf-2",
            member_id: COUPLE_MEMBER.id,
            rotary_year: YEAR,
            price_type: "early_bird",
            is_couple_at_billing: true,
            amount_due: 900,
            is_paid: true,
            paid_date: "2026-01-01",
            invoice_sent_at: null,
            invoice_send_count: 1,
            last_channel: "email",
            notes: null,
            created_by: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]),
      ),
      http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, () => HttpResponse.json(SETTINGS)),
      http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([SETTINGS])),
      http.post(`${API_BASE_URL}/fee-runs/${YEAR}/send`, () =>
        HttpResponse.json(
          {
            rotary_year: YEAR,
            sent_count: 1,
            skipped_paid_count: 1,
            failed_count: 0,
            email_log_id: "log-1",
            member_fees: [],
          },
          { status: 201 },
        ),
      ),
    );

    render(<FeeRunManagement />);
    await waitForLoaded();

    expect(screen.getByText(/1 unpaid member will receive an invoice/i)).toBeInTheDocument();
    expect(screen.getByText(/1 already-paid member will be skipped/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /send invoices/i }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /confirm send/i }));
    expect(await screen.findByText(/sent: 1/i)).toBeInTheDocument();
  });

  it("sends a single invoice by email via the per-member button", async () => {
    mockCanManage = true;
    let fee = {
      id: "mf-1",
      member_id: SINGLE_MEMBER.id,
      rotary_year: YEAR,
      price_type: "early_bird",
      is_couple_at_billing: false,
      amount_due: 500,
      is_paid: false,
      paid_date: null,
      invoice_sent_at: null,
      invoice_send_count: 0,
      last_channel: null,
      notes: null,
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    server.use(
      http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([SINGLE_MEMBER])),
      http.get(`${API_BASE_URL}/fee-runs/${YEAR}`, () => HttpResponse.json([fee])),
      http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, () => HttpResponse.json(SETTINGS)),
      http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([SETTINGS])),
      http.post(`${API_BASE_URL}/fee-runs/${YEAR}/send`, () => {
        fee = {
          ...fee,
          invoice_send_count: 1,
          invoice_sent_at: new Date().toISOString(),
          last_channel: "email",
        };
        return HttpResponse.json(
          {
            rotary_year: YEAR,
            sent_count: 1,
            skipped_paid_count: 0,
            failed_count: 0,
            email_log_id: "log-1",
            member_fees: [fee],
          },
          { status: 201 },
        );
      }),
    );

    render(<FeeRunManagement />);
    await waitForLoaded();

    await userEvent.click(screen.getByRole("button", { name: /^send email$/i }));

    expect(await screen.findByText(/email × 1/i)).toBeInTheDocument();
  });

  it("denies access for a user without invoices.manage access", async () => {
    mockCanManage = false;
    render(<FeeRunManagement />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/do not have permission/i);
  });
});
