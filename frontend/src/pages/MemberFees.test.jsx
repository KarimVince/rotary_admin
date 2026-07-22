import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import { currentRotaryYear } from "../utils/rotaryYear";
import MemberFees from "./MemberFees";

const API_BASE_URL = "http://localhost:8000/api/v1";
const YEAR = currentRotaryYear();

const NO_FEE_SETTINGS = () => HttpResponse.json({ detail: "No fee settings found" }, { status: 404 });

let permissionsByKey = {};
vi.mock("../hooks/useAccess", () => ({
  useAccess: (key) => permissionsByKey[key] ?? { canRead: true, canWrite: true },
}));

function allTabsAllowed() {
  permissionsByKey = {
    "fees.tracking": { canRead: true, canWrite: true },
    "fees.run": { canRead: true, canWrite: true },
    "fees.statistics": { canRead: true, canWrite: true },
    "fees.settings": { canRead: true, canWrite: true },
  };
}

function renderFees(initialPath = "/fees") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/fees" element={<MemberFees />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
}

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

describe("MemberFees", () => {
  it("shows a tab bar and defaults to the first tab the user can read", async () => {
    allTabsAllowed();
    server.use(
      http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/member-fees`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, NO_FEE_SETTINGS),
      http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
    );

    renderFees();
    await waitForLoaded();

    expect(screen.getByRole("heading", { name: /member fees/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^tracking$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^fee run$/i })).toBeInTheDocument();
  });

  it("only shows tabs the user has read access to", async () => {
    permissionsByKey = {
      "fees.tracking": { canRead: true, canWrite: true },
      "fees.run": { canRead: false, canWrite: false },
      "fees.statistics": { canRead: false, canWrite: false },
      "fees.settings": { canRead: false, canWrite: false },
    };
    server.use(
      http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/member-fees`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, NO_FEE_SETTINGS),
      http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
    );

    renderFees();
    await waitForLoaded();

    expect(screen.getByRole("button", { name: /^tracking$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^fee run$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^settings$/i })).not.toBeInTheDocument();
  });

  describe("Tracking tab", () => {
    const MEMBER = { id: "member-1", first_name: "Jane", last_name: "Doe", status: "active" };
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

    it("lists fee records with member names and stat cards", async () => {
      allTabsAllowed();
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER])),
        http.get(`${API_BASE_URL}/member-fees`, () => HttpResponse.json([FEE])),
        http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, NO_FEE_SETTINGS),
        http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
      );

      renderFees("/fees?tab=tracking");
      await waitForLoaded();

      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
      expect(screen.getByLabelText(/due amount for jane doe/i)).toHaveValue(500);
      expect(screen.getByText("Total due")).toBeInTheDocument();
      expect(screen.getByText("Outstanding")).toBeInTheDocument();
    });

    it("marks a fee as paid via the status chip and defaults amount paid to amount due", async () => {
      allTabsAllowed();
      let fee = { ...FEE };
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

      renderFees("/fees?tab=tracking");
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: /mark jane doe paid/i }));

      await waitFor(() =>
        expect(screen.getByRole("button", { name: /mark jane doe paid/i })).toHaveTextContent(/^paid$/i),
      );
      expect(screen.getByLabelText(/amount paid by jane doe/i)).toHaveValue(500);
    });

    it("amends the amount paid independently of the standard amount due", async () => {
      allTabsAllowed();
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

      renderFees("/fees?tab=tracking");
      await waitForLoaded();

      const amountPaidInput = screen.getByLabelText(/amount paid by jane doe/i);
      await userEvent.clear(amountPaidInput);
      await userEvent.type(amountPaidInput, "250");
      await userEvent.tab();

      await waitFor(() => expect(screen.getByLabelText(/amount paid by jane doe/i)).toHaveValue(250));
      // "Amount due" (the standard invoiced amount) must stay untouched.
      expect(screen.getByLabelText(/due amount for jane doe/i)).toHaveValue(500);
    });

    it("amends the tier and due amount, and Total Due reflects the change", async () => {
      allTabsAllowed();
      let fee = { ...FEE };
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

      renderFees("/fees?tab=tracking");
      await waitForLoaded();

      await userEvent.selectOptions(screen.getByLabelText(/tier for jane doe/i), "sponsored");
      await waitFor(() => expect(screen.getByLabelText(/tier for jane doe/i)).toHaveValue("sponsored"));

      const dueInput = screen.getByLabelText(/due amount for jane doe/i);
      await userEvent.clear(dueInput);
      await userEvent.type(dueInput, "350");
      await userEvent.tab();

      await waitFor(() => expect(screen.getByLabelText(/due amount for jane doe/i)).toHaveValue(350));
      expect(screen.getByText("Total due").nextSibling).toHaveTextContent("350");
    });

    it("shows an error when marking paid fails", async () => {
      allTabsAllowed();
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER])),
        http.get(`${API_BASE_URL}/member-fees`, () => HttpResponse.json([FEE])),
        http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, NO_FEE_SETTINGS),
        http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
        http.patch(`${API_BASE_URL}/member-fees/${FEE.id}`, () =>
          HttpResponse.json({ detail: "Update failed" }, { status: 500 }),
        ),
      );

      renderFees("/fees?tab=tracking");
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: /mark jane doe paid/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/update failed/i);
    });

    it("selecting Manual channel auto-checks invoice sent", async () => {
      allTabsAllowed();
      let fee = { ...FEE };
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER])),
        http.get(`${API_BASE_URL}/member-fees`, () => HttpResponse.json([fee])),
        http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, NO_FEE_SETTINGS),
        http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
        http.patch(`${API_BASE_URL}/member-fees/${FEE.id}`, async ({ request }) => {
          const body = await request.json();
          fee = { ...fee, ...body, invoice_sent_at: body.invoice_sent ? new Date().toISOString() : fee.invoice_sent_at };
          return HttpResponse.json(fee);
        }),
      );

      renderFees("/fees?tab=tracking");
      await waitForLoaded();

      await userEvent.selectOptions(screen.getByLabelText(/channel for jane doe/i), "manual");

      await waitFor(() => expect(screen.getByLabelText(/channel for jane doe/i)).toHaveValue("manual"));
      expect(screen.getByLabelText(/invoice sent for jane doe/i)).toBeChecked();
    });

    it("filters by search text", async () => {
      allTabsAllowed();
      const other = { id: "member-2", first_name: "Alex", last_name: "Smith", status: "active" };
      const otherFee = { ...FEE, id: "fee-2", member_id: other.id };
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER, other])),
        http.get(`${API_BASE_URL}/member-fees`, () => HttpResponse.json([FEE, otherFee])),
        http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, NO_FEE_SETTINGS),
        http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
      );

      renderFees("/fees?tab=tracking");
      await waitForLoaded();

      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
      expect(screen.getByText("Alex Smith")).toBeInTheDocument();

      await userEvent.type(screen.getByLabelText(/search member/i), "Alex");

      expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument();
      expect(screen.getByText("Alex Smith")).toBeInTheDocument();
    });

    it("sends a reminder to unpaid members", async () => {
      allTabsAllowed();
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER])),
        http.get(`${API_BASE_URL}/member-fees`, () => HttpResponse.json([FEE])),
        http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, NO_FEE_SETTINGS),
        http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
        http.post(`${API_BASE_URL}/fee-runs/${YEAR}/send`, () =>
          HttpResponse.json(
            {
              rotary_year: YEAR,
              sent_count: 1,
              skipped_paid_count: 0,
              failed_count: 0,
              email_log_id: "log-1",
              member_fees: [FEE],
            },
            { status: 201 },
          ),
        ),
      );

      renderFees("/fees?tab=tracking");
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: /send reminder to unpaid/i }));

      expect(await screen.findByText(/reminders sent: 1/i)).toBeInTheDocument();
    });

    it("shows a placeholder row for members not yet invoiced once fee settings exist", async () => {
      allTabsAllowed();
      const uninvoicedMember = { id: "member-2", first_name: "Alex", last_name: "Smith", status: "active" };
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER, uninvoicedMember])),
        http.get(`${API_BASE_URL}/member-fees`, () => HttpResponse.json([FEE])),
        http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, () => HttpResponse.json({ rotary_year: YEAR, currency: "HKD" })),
        http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([{ rotary_year: YEAR, currency: "HKD" }])),
      );

      renderFees("/fees?tab=tracking");
      await waitForLoaded();

      expect(screen.getByText("Alex Smith")).toBeInTheDocument();
      expect(screen.getByText(/not yet invoiced/i)).toBeInTheDocument();
    });

    it("denies access for a user with no fees.tracking access", async () => {
      permissionsByKey = {
        "fees.tracking": { canRead: false, canWrite: false },
        "fees.run": { canRead: false, canWrite: false },
        "fees.statistics": { canRead: false, canWrite: false },
        "fees.settings": { canRead: false, canWrite: false },
      };

      renderFees("/fees?tab=tracking");
      expect(await screen.findByRole("alert")).toHaveTextContent(/do not have permission to view any part/i);
    });

    it("disables the paid button and channel select for a user with view but not manage access", async () => {
      permissionsByKey = {
        "fees.tracking": { canRead: true, canWrite: false },
        "fees.run": { canRead: false, canWrite: false },
        "fees.statistics": { canRead: false, canWrite: false },
        "fees.settings": { canRead: false, canWrite: false },
      };
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER])),
        http.get(`${API_BASE_URL}/member-fees`, () => HttpResponse.json([FEE])),
        http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, NO_FEE_SETTINGS),
        http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
      );

      renderFees("/fees?tab=tracking");
      await waitForLoaded();

      expect(screen.getByRole("button", { name: /mark jane doe paid/i })).toBeDisabled();
      expect(screen.getByLabelText(/channel for jane doe/i)).toBeDisabled();
      expect(screen.getByLabelText(/invoice sent for jane doe/i)).toBeDisabled();
      expect(screen.queryByRole("button", { name: /send reminder to unpaid/i })).not.toBeInTheDocument();
    });
  });

  describe("Fee Run tab", () => {
    const SINGLE_MEMBER = { id: "member-1", first_name: "Single", last_name: "Smith", is_couple: false, status: "active" };
    const COUPLE_MEMBER = { id: "member-2", first_name: "Couple", last_name: "Jones", is_couple: true, status: "active" };

    it("previews per-row tier amounts, defaulting every row to Early Bird", async () => {
      allTabsAllowed();
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([SINGLE_MEMBER, COUPLE_MEMBER])),
        http.get(`${API_BASE_URL}/fee-runs/${YEAR}`, () => HttpResponse.json([])),
        http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, () => HttpResponse.json(SETTINGS)),
        http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([SETTINGS])),
      );

      renderFees("/fees?tab=run");
      await waitForLoaded();

      expect(screen.getByLabelText(/amount for single smith/i)).toHaveValue(500);
      expect(screen.getByLabelText(/amount for couple jones/i)).toHaveValue(900);
    });

    it("updates the preview amount when a row's tier is changed to Full", async () => {
      allTabsAllowed();
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([SINGLE_MEMBER])),
        http.get(`${API_BASE_URL}/fee-runs/${YEAR}`, () => HttpResponse.json([])),
        http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, () => HttpResponse.json(SETTINGS)),
        http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([SETTINGS])),
      );

      renderFees("/fees?tab=run");
      await waitForLoaded();

      await userEvent.selectOptions(screen.getByLabelText(/tier for single smith/i), "full");

      await waitFor(() =>
        expect(screen.getByLabelText(/amount for single smith/i)).toHaveValue(600),
      );
    });

    it("shows a blank custom price field for the Sponsored tier and requires it before generating", async () => {
      allTabsAllowed();
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([SINGLE_MEMBER])),
        http.get(`${API_BASE_URL}/fee-runs/${YEAR}`, () => HttpResponse.json([])),
        http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, () => HttpResponse.json(SETTINGS)),
        http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([SETTINGS])),
      );

      renderFees("/fees?tab=run");
      await waitForLoaded();

      await userEvent.selectOptions(screen.getByLabelText(/tier for single smith/i), "sponsored");
      await waitFor(() =>
        expect(screen.getByLabelText(/amount for single smith/i)).toHaveValue(null),
      );

      await userEvent.click(screen.getByLabelText(/select single smith/i));
      await userEvent.click(screen.getByRole("button", { name: /generate fee run \(1\)/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        /enter a sponsored amount for: single smith/i,
      );
    });

    it("warns when no fee settings exist for the year", async () => {
      allTabsAllowed();
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([])),
        http.get(`${API_BASE_URL}/fee-runs/${YEAR}`, () => HttpResponse.json([])),
        http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, NO_FEE_SETTINGS),
        http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
      );

      renderFees("/fees?tab=run");
      await waitForLoaded();

      expect(await screen.findByRole("alert")).toHaveTextContent(/no fee settings configured/i);
    });

    it("generates a fee run for the selected members with their own tiers", async () => {
      allTabsAllowed();
      let capturedBody;
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([SINGLE_MEMBER, COUPLE_MEMBER])),
        http.get(`${API_BASE_URL}/fee-runs/${YEAR}`, () => HttpResponse.json([])),
        http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, () => HttpResponse.json(SETTINGS)),
        http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([SETTINGS])),
        http.post(`${API_BASE_URL}/fee-runs`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json(
            {
              rotary_year: YEAR,
              price_type: null,
              created_count: 2,
              updated_count: 0,
              skipped_paid_count: 0,
              member_fees: [],
            },
            { status: 201 },
          );
        }),
      );

      renderFees("/fees?tab=run");
      await waitForLoaded();

      await userEvent.selectOptions(screen.getByLabelText(/tier for couple jones/i), "full");
      await userEvent.click(screen.getByLabelText(/select single smith/i));
      await userEvent.click(screen.getByLabelText(/select couple jones/i));
      await userEvent.click(screen.getByRole("button", { name: /generate fee run \(2\)/i }));

      expect(await screen.findByText(/2 created/i)).toBeInTheDocument();
      await waitFor(() =>
        expect(capturedBody).toEqual({
          rotary_year: YEAR,
          member_tiers: [
            { member_id: SINGLE_MEMBER.id, price_type: "early_bird" },
            { member_id: COUPLE_MEMBER.id, price_type: "full" },
          ],
        }),
      );
    });

    it("generates a Sponsored fee run with the typed custom price", async () => {
      allTabsAllowed();
      let capturedBody;
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([SINGLE_MEMBER])),
        http.get(`${API_BASE_URL}/fee-runs/${YEAR}`, () => HttpResponse.json([])),
        http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, () => HttpResponse.json(SETTINGS)),
        http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([SETTINGS])),
        http.post(`${API_BASE_URL}/fee-runs`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json(
            {
              rotary_year: YEAR,
              price_type: null,
              created_count: 1,
              updated_count: 0,
              skipped_paid_count: 0,
              member_fees: [],
            },
            { status: 201 },
          );
        }),
      );

      renderFees("/fees?tab=run");
      await waitForLoaded();

      await userEvent.selectOptions(screen.getByLabelText(/tier for single smith/i), "sponsored");
      await userEvent.type(screen.getByLabelText(/amount for single smith/i), "275");
      await userEvent.click(screen.getByLabelText(/select single smith/i));
      await userEvent.click(screen.getByRole("button", { name: /generate fee run \(1\)/i }));

      expect(await screen.findByText(/1 created/i)).toBeInTheDocument();
      await waitFor(() =>
        expect(capturedBody).toEqual({
          rotary_year: YEAR,
          member_tiers: [{ member_id: SINGLE_MEMBER.id, price_type: "sponsored", amount_due: 275 }],
        }),
      );
    });

    it("shows a send confirmation with unpaid and skipped counts, then sends", async () => {
      allTabsAllowed();
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

      renderFees("/fees?tab=run");
      await waitForLoaded();

      expect(screen.getByText(/1 unpaid member will receive an invoice/i)).toBeInTheDocument();
      expect(screen.getByText(/1 already-paid member will be skipped/i)).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: /send invoices \(1\)/i }));
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: /confirm send/i }));
      expect(await screen.findByText(/sent: 1/i)).toBeInTheDocument();
    });

    it("sends a single invoice by email via the per-member button", async () => {
      allTabsAllowed();
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
          fee = { ...fee, invoice_send_count: 1, invoice_sent_at: new Date().toISOString(), last_channel: "email" };
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

      renderFees("/fees?tab=run");
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: /^send email$/i }));

      expect(await screen.findByText(/email × 1/i)).toBeInTheDocument();
    });

    it("denies access for a user without fees.run access", async () => {
      permissionsByKey = {
        "fees.tracking": { canRead: false, canWrite: false },
        "fees.run": { canRead: false, canWrite: false },
        "fees.statistics": { canRead: false, canWrite: false },
        "fees.settings": { canRead: false, canWrite: false },
      };
      renderFees("/fees?tab=run");
      expect(await screen.findByRole("alert")).toHaveTextContent(/do not have permission to view any part/i);
    });
  });

  describe("Statistics tab", () => {
    const STATS = {
      rotary_year: YEAR,
      currency: "HKD",
      total_members: 3,
      paid_count: 2,
      unpaid_count: 1,
      total_collected: 1100,
      total_outstanding: 500,
      collection_rate: 68.75,
      breakdown_by_price_type: [],
      active_member_count: 4,
      average_fee_per_active_member: 275,
    };
    const HISTORY = [
      { rotary_year: YEAR - 1, total_collected: 900, paid_count: 3, zero_count: 1 },
      { rotary_year: YEAR, total_collected: 1100, paid_count: 2, zero_count: 2 },
    ];

    it("shows collected, outstanding, and collection rate for the selected year", async () => {
      allTabsAllowed();
      server.use(
        http.get(`${API_BASE_URL}/member-fees/statistics`, () => HttpResponse.json(STATS)),
        http.get(`${API_BASE_URL}/member-fees/statistics/history`, () => HttpResponse.json(HISTORY)),
        http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
      );

      renderFees("/fees?tab=statistics");
      await waitForLoaded();

      expect(screen.getByText("1,100 HKD")).toBeInTheDocument();
      expect(screen.getByText("500 HKD")).toBeInTheDocument();
    });

    it("gives each summary card a distinct background color and a minimum height (Story 16.15)", async () => {
      allTabsAllowed();
      server.use(
        http.get(`${API_BASE_URL}/member-fees/statistics`, () => HttpResponse.json(STATS)),
        http.get(`${API_BASE_URL}/member-fees/statistics/history`, () => HttpResponse.json(HISTORY)),
        http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
      );

      renderFees("/fees?tab=statistics");
      await waitForLoaded();

      const averageCard = screen.getByText("275 HKD").closest("div.flex");
      const collectedCard = screen.getByText("1,100 HKD").closest("div.flex");
      const outstandingCard = screen.getByText("500 HKD").closest("div.flex");

      expect(averageCard).toHaveStyle({ background: "var(--tone-blue-bg)" });
      expect(collectedCard).toHaveStyle({ background: "var(--tone-teal-bg)" });
      expect(outstandingCard).toHaveStyle({ background: "var(--tone-rose-bg)" });
      [averageCard, collectedCard, outstandingCard].forEach((card) => {
        expect(card.className).toMatch(/min-h-\[104px\]/);
      });
    });

    it("renders the chart section headings from history", async () => {
      allTabsAllowed();
      server.use(
        http.get(`${API_BASE_URL}/member-fees/statistics`, () => HttpResponse.json(STATS)),
        http.get(`${API_BASE_URL}/member-fees/statistics/history`, () => HttpResponse.json(HISTORY)),
        http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
      );

      renderFees("/fees?tab=statistics");
      await waitForLoaded();

      expect(screen.getByText(/amount collected over years/i)).toBeInTheDocument();
      expect(screen.getByText(/paying members over years/i)).toBeInTheDocument();
    });

    describe("Generate Report (Story 16.16)", () => {
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

      it("downloads a PDF report for the selected year", async () => {
        allTabsAllowed();
        let requestUrl;
        server.use(
          http.get(`${API_BASE_URL}/member-fees/statistics`, () => HttpResponse.json(STATS)),
          http.get(`${API_BASE_URL}/member-fees/statistics/history`, () => HttpResponse.json(HISTORY)),
          http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
          http.post(`${API_BASE_URL}/member-fees/statistics/report`, ({ request }) => {
            requestUrl = new URL(request.url);
            return new HttpResponse("fake-pdf-bytes", {
              headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="fee-statistics.pdf"',
              },
            });
          }),
        );

        renderFees("/fees?tab=statistics");
        await waitForLoaded();

        await userEvent.click(screen.getByRole("button", { name: /generate report/i }));

        await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
        expect(requestUrl.searchParams.get("format")).toBe("pdf");
        expect(requestUrl.searchParams.get("rotary_year")).toBe(String(YEAR));
      });

      it("requests the pptx format when selected", async () => {
        allTabsAllowed();
        let requestedFormat;
        server.use(
          http.get(`${API_BASE_URL}/member-fees/statistics`, () => HttpResponse.json(STATS)),
          http.get(`${API_BASE_URL}/member-fees/statistics/history`, () => HttpResponse.json(HISTORY)),
          http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
          http.post(`${API_BASE_URL}/member-fees/statistics/report`, ({ request }) => {
            requestedFormat = new URL(request.url).searchParams.get("format");
            return new HttpResponse("fake-pptx-bytes", {
              headers: { "Content-Disposition": 'attachment; filename="report.pptx"' },
            });
          }),
        );

        renderFees("/fees?tab=statistics");
        await waitForLoaded();

        await userEvent.selectOptions(screen.getByLabelText(/generate report/i), "pptx");
        await userEvent.click(screen.getByRole("button", { name: /generate report/i }));

        await waitFor(() => expect(requestedFormat).toBe("pptx"));
      });

      it("shows an error if report generation fails", async () => {
        allTabsAllowed();
        server.use(
          http.get(`${API_BASE_URL}/member-fees/statistics`, () => HttpResponse.json(STATS)),
          http.get(`${API_BASE_URL}/member-fees/statistics/history`, () => HttpResponse.json(HISTORY)),
          http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
          http.post(`${API_BASE_URL}/member-fees/statistics/report`, () =>
            HttpResponse.json({ detail: "Report generation failed" }, { status: 500 }),
          ),
        );

        renderFees("/fees?tab=statistics");
        await waitForLoaded();

        await userEvent.click(screen.getByRole("button", { name: /generate report/i }));

        expect(await screen.findByRole("alert")).toHaveTextContent(/report generation failed/i);
      });
    });
  });

  describe("Settings tab", () => {
    it("loads and displays existing prices for the selected year", async () => {
      allTabsAllowed();
      server.use(
        http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([SETTINGS])),
        http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, () => HttpResponse.json(SETTINGS)),
      );

      renderFees("/fees?tab=settings");
      await waitForLoaded();

      expect(screen.getByLabelText(/early bird — single/i)).toHaveValue(500);
      expect(screen.getByRole("button", { name: /update prices/i })).toBeInTheDocument();
    });

    it("creates fee settings for a year that has none yet", async () => {
      allTabsAllowed();
      let created = null;
      server.use(
        http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json(created ? [created] : [])),
        http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, () =>
          created ? HttpResponse.json(created) : NO_FEE_SETTINGS(),
        ),
        http.post(`${API_BASE_URL}/fee-settings`, async ({ request }) => {
          const body = await request.json();
          created = { ...SETTINGS, ...body };
          return HttpResponse.json(created, { status: 201 });
        }),
      );

      renderFees("/fees?tab=settings");
      await waitForLoaded();

      await userEvent.type(screen.getByLabelText(/early bird — single/i), "500");
      await userEvent.type(screen.getByLabelText(/early bird — couple/i), "900");
      await userEvent.type(screen.getByLabelText(/full — single/i), "600");
      await userEvent.type(screen.getByLabelText(/full — couple/i), "1000");
      await userEvent.click(screen.getByRole("button", { name: /save prices/i }));

      expect(await screen.findByText(/fee settings saved/i)).toBeInTheDocument();
    });

    it("adds a year to the selector via the Add year form", async () => {
      allTabsAllowed();
      const futureYear = YEAR + 1;
      server.use(
        http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([])),
        http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, NO_FEE_SETTINGS),
        http.get(`${API_BASE_URL}/fee-settings/${futureYear}`, NO_FEE_SETTINGS),
      );

      renderFees("/fees?tab=settings");
      await waitForLoaded();

      const addYearInput = screen.getByLabelText(/add a year/i);
      await userEvent.clear(addYearInput);
      await userEvent.type(addYearInput, String(futureYear));
      await userEvent.click(screen.getByRole("button", { name: /add year/i }));

      expect(screen.getByLabelText(/rotary year/i)).toHaveValue(String(futureYear));
    });

    it("shows prices read-only for a user with view but not manage access", async () => {
      permissionsByKey = {
        "fees.tracking": { canRead: false, canWrite: false },
        "fees.run": { canRead: false, canWrite: false },
        "fees.statistics": { canRead: false, canWrite: false },
        "fees.settings": { canRead: true, canWrite: false },
      };
      server.use(
        http.get(`${API_BASE_URL}/fee-settings`, () => HttpResponse.json([SETTINGS])),
        http.get(`${API_BASE_URL}/fee-settings/${YEAR}`, () => HttpResponse.json(SETTINGS)),
      );

      renderFees("/fees?tab=settings");
      await waitForLoaded();

      expect(screen.getByLabelText(/early bird — single/i)).toBeDisabled();
      expect(screen.queryByRole("button", { name: /update prices/i })).not.toBeInTheDocument();
    });
  });
});
