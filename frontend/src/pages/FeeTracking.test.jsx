import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import { currentRotaryYear } from "../utils/rotaryYear";
import FeeTracking from "./FeeTracking";

const API_BASE_URL = "http://localhost:8000/api/v1";
const YEAR = currentRotaryYear();

const MEMBER = {
  id: "member-1",
  first_name: "Jane",
  last_name: "Doe",
  status: "active",
};

const FEE = {
  id: "fee-1",
  member_id: MEMBER.id,
  rotary_year: YEAR,
  price_type: "early_bird",
  is_couple_at_billing: false,
  amount_due: 500,
  amount_paid: null,
  is_paid: false,
  paid_date: null,
  paid_by: null,
  invoice_sent_at: null,
  invoice_send_count: 1,
  last_channel: "email",
  notes: null,
  created_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const NO_FEE_SETTINGS = () =>
  HttpResponse.json({ detail: "No fee settings found" }, { status: 404 });

let mockCanRead = true;
let mockCanWrite = true;
vi.mock("../hooks/useAccess", () => ({
  // Story 12.5: FeeTracking's read and write checks now both resolve
  // against the single fees.tracking key.
  useAccess: () => ({ canRead: mockCanRead, canWrite: mockCanWrite }),
}));

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
}

describe("FeeTracking", () => {
  it("lists fee records with member names", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    server.use(
      http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER])),
      http.get(`${API_BASE_URL}/member-fees`, () => HttpResponse.json([FEE])),
      http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, NO_FEE_SETTINGS),
      http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
    );

    render(<FeeTracking />);
    await waitForLoaded();

    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("500")).toBeInTheDocument();
  });

  it("marks a fee as paid via the checkbox and defaults amount paid to amount due", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    let fee = { ...FEE };
    server.use(
      http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER])),
      http.get(`${API_BASE_URL}/member-fees`, () => HttpResponse.json([fee])),
      http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, NO_FEE_SETTINGS),
      http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
      http.patch(`${API_BASE_URL}/member-fees/${FEE.id}`, async ({ request }) => {
        const body = await request.json();
        fee = { ...fee, ...body, paid_date: body.is_paid ? "2026-07-07" : fee.paid_date };
        return HttpResponse.json(fee);
      }),
    );

    render(<FeeTracking />);
    await waitForLoaded();

    await userEvent.click(screen.getByLabelText(/mark jane doe paid/i));

    await waitFor(() => expect(screen.getByLabelText(/mark jane doe paid/i)).toBeChecked());
    expect(screen.getByLabelText(/amount paid by jane doe/i)).toHaveValue(500);
  });

  it("amends the amount paid independently of the standard amount due", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    let fee = { ...FEE, is_paid: true, amount_paid: 500 };
    server.use(
      http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER])),
      http.get(`${API_BASE_URL}/member-fees`, () => HttpResponse.json([fee])),
      http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, NO_FEE_SETTINGS),
      http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
      http.patch(`${API_BASE_URL}/member-fees/${FEE.id}`, async ({ request }) => {
        const body = await request.json();
        fee = { ...fee, ...body };
        return HttpResponse.json(fee);
      }),
    );

    render(<FeeTracking />);
    await waitForLoaded();

    const amountPaidInput = screen.getByLabelText(/amount paid by jane doe/i);
    await userEvent.clear(amountPaidInput);
    await userEvent.type(amountPaidInput, "250");
    await userEvent.tab();

    // amount_due (the standard invoiced amount) must stay untouched in the
    // "Amount due" column even though amount_paid was amended below.
    await waitFor(() => expect(screen.getByLabelText(/amount paid by jane doe/i)).toHaveValue(250));
    expect(screen.getByText("500")).toBeInTheDocument();
  });

  it("accepts zero as a valid amount paid", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    let fee = { ...FEE, is_paid: true, amount_paid: 500 };
    server.use(
      http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER])),
      http.get(`${API_BASE_URL}/member-fees`, () => HttpResponse.json([fee])),
      http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, NO_FEE_SETTINGS),
      http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
      http.patch(`${API_BASE_URL}/member-fees/${FEE.id}`, async ({ request }) => {
        const body = await request.json();
        fee = { ...fee, ...body };
        return HttpResponse.json(fee);
      }),
    );

    render(<FeeTracking />);
    await waitForLoaded();

    const amountPaidInput = screen.getByLabelText(/amount paid by jane doe/i);
    await userEvent.clear(amountPaidInput);
    await userEvent.type(amountPaidInput, "0");
    await userEvent.tab();

    await waitFor(() => expect(screen.getByLabelText(/amount paid by jane doe/i)).toHaveValue(0));
  });

  it("shows an error when marking paid fails", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    server.use(
      http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER])),
      http.get(`${API_BASE_URL}/member-fees`, () => HttpResponse.json([FEE])),
      http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, NO_FEE_SETTINGS),
      http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
      http.patch(`${API_BASE_URL}/member-fees/${FEE.id}`, () =>
        HttpResponse.json({ detail: "Update failed" }, { status: 500 }),
      ),
    );

    render(<FeeTracking />);
    await waitForLoaded();

    await userEvent.click(screen.getByLabelText(/mark jane doe paid/i));

    expect(await screen.findByRole("alert")).toHaveTextContent(/update failed/i);
  });

  it("toggles invoice sent directly and persists it", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    let fee = { ...FEE };
    server.use(
      http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER])),
      http.get(`${API_BASE_URL}/member-fees`, () => HttpResponse.json([fee])),
      http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, NO_FEE_SETTINGS),
      http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
      http.patch(`${API_BASE_URL}/member-fees/${FEE.id}`, async ({ request }) => {
        const body = await request.json();
        fee = {
          ...fee,
          ...body,
          invoice_sent_at: body.invoice_sent ? new Date().toISOString() : null,
        };
        return HttpResponse.json(fee);
      }),
    );

    render(<FeeTracking />);
    await waitForLoaded();

    await userEvent.click(screen.getByLabelText(/invoice sent for jane doe/i));

    await waitFor(() =>
      expect(screen.getByLabelText(/invoice sent for jane doe/i)).toBeChecked(),
    );
  });

  it("selecting Manual channel auto-checks invoice sent", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    let fee = { ...FEE };
    server.use(
      http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER])),
      http.get(`${API_BASE_URL}/member-fees`, () => HttpResponse.json([fee])),
      http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, NO_FEE_SETTINGS),
      http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
      http.patch(`${API_BASE_URL}/member-fees/${FEE.id}`, async ({ request }) => {
        const body = await request.json();
        fee = {
          ...fee,
          ...body,
          invoice_sent_at: body.invoice_sent ? new Date().toISOString() : fee.invoice_sent_at,
        };
        return HttpResponse.json(fee);
      }),
    );

    render(<FeeTracking />);
    await waitForLoaded();

    await userEvent.selectOptions(screen.getByLabelText(/channel for jane doe/i), "manual");

    await waitFor(() =>
      expect(screen.getByLabelText(/channel for jane doe/i)).toHaveValue("manual"),
    );
    expect(screen.getByLabelText(/invoice sent for jane doe/i)).toBeChecked();
  });

  it("shows a placeholder row for members not yet invoiced once fee settings exist", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    const uninvoicedMember = { id: "member-2", first_name: "Alex", last_name: "Smith", status: "active" };
    server.use(
      http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER, uninvoicedMember])),
      http.get(`${API_BASE_URL}/member-fees`, () => HttpResponse.json([FEE])),
      http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, () =>
        HttpResponse.json({ rotary_year: YEAR, currency: "HKD" }),
      ),
      http.get(`${API_BASE_URL}/fee-settings`, () =>
        HttpResponse.json([{ rotary_year: YEAR, currency: "HKD" }]),
      ),
    );

    render(<FeeTracking />);
    await waitForLoaded();

    expect(screen.getByText("Alex Smith")).toBeInTheDocument();
    expect(screen.getByText(/not yet invoiced/i)).toBeInTheDocument();
  });

  it("hides placeholder rows once fee settings do not exist for the year", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    const uninvoicedMember = { id: "member-2", first_name: "Alex", last_name: "Smith", status: "active" };
    server.use(
      http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER, uninvoicedMember])),
      http.get(`${API_BASE_URL}/member-fees`, () => HttpResponse.json([FEE])),
      http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, NO_FEE_SETTINGS),
      http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
    );

    render(<FeeTracking />);
    await waitForLoaded();

    expect(screen.queryByText("Alex Smith")).not.toBeInTheDocument();
  });

  it("denies access for a user with no invoices.view access", async () => {
    mockCanRead = false;
    mockCanWrite = false;
    render(<FeeTracking />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/do not have permission/i);
  });

  it("disables the paid checkbox and channel select for a user with view but not manage access", async () => {
    mockCanRead = true;
    mockCanWrite = false;
    server.use(
      http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER])),
      http.get(`${API_BASE_URL}/member-fees`, () => HttpResponse.json([FEE])),
      http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, NO_FEE_SETTINGS),
      http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
    );

    render(<FeeTracking />);
    await waitForLoaded();

    expect(screen.getByLabelText(/mark jane doe paid/i)).toBeDisabled();
    expect(screen.getByLabelText(/channel for jane doe/i)).toBeDisabled();
    expect(screen.getByLabelText(/invoice sent for jane doe/i)).toBeDisabled();
  });
});
