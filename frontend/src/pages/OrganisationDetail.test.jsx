import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../hooks/useAuth";
import { server } from "../test/mocks/server";
import { currentRotaryYear } from "../utils/rotaryYear";
import OrganisationDetail from "./OrganisationDetail";

vi.mock("../hooks/useAuth");

let mockCanRead = true;
let mockCanWrite = false;
vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: mockCanRead, canWrite: mockCanWrite }),
}));

function mockRole(role) {
  mockCanRead = true;
  mockCanWrite = role === "admin";
}

const API_BASE_URL = "http://localhost:8000/api/v1";
const THIS_YEAR = currentRotaryYear();

const ORG = {
  id: "org-1",
  name: "Clean Water Project",
  description: "Wells in rural areas",
  contact_name: "Sara",
  contact_email: "sara@example.com",
  contact_phone: null,
  country: "Chad",
  first_supported_year: 2019,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const CURRENT_DONATION = {
  id: "don-current",
  organisation_id: "org-1",
  rotary_year: THIS_YEAR,
  amount: 500,
  currency: "EUR",
  donation_date: `${THIS_YEAR}-09-01`,
  notes: "Annual gift",
  created_by: "user-1",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const PAST_DONATION = {
  ...CURRENT_DONATION,
  id: "don-past",
  rotary_year: THIS_YEAR - 2,
  amount: 200,
  donation_date: `${THIS_YEAR - 2}-09-01`,
  notes: "Older gift",
};

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/ngos/org-1"]}>
      <Routes>
        <Route path="/ngos/:organisationId" element={<OrganisationDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
}

describe("OrganisationDetail", () => {
  beforeEach(() => {
    server.use(
      http.get(`${API_BASE_URL}/organisations/org-1`, () => HttpResponse.json(ORG)),
      http.get(`${API_BASE_URL}/organisations/org-1/donations`, () =>
        HttpResponse.json([CURRENT_DONATION, PAST_DONATION]),
      ),
    );
  });

  it("shows org info, total, and buckets current vs past donations", async () => {
    useAuth.mockReturnValue({ user: { role: "user" } });
    mockRole("user");
    renderDetail();
    await waitForLoaded();

    expect(screen.getByRole("heading", { name: "Clean Water Project" })).toBeInTheDocument();
    expect(screen.getByText(/Total donated \(all years\)/i)).toHaveTextContent("700");

    expect(screen.getByText("Annual gift")).toBeInTheDocument();
    expect(screen.getByText("Older gift")).toBeInTheDocument();
  });

  it("highlights the current rotary-year donation row", async () => {
    useAuth.mockReturnValue({ user: { role: "user" } });
    mockRole("user");
    const { container } = renderDetail();
    await waitForLoaded();

    const highlighted = container.querySelectorAll(".donation-row-current");
    expect(highlighted).toHaveLength(1);
    expect(within(highlighted[0]).getByText("Annual gift")).toBeInTheDocument();
  });

  it("hides the add-donation form from non-admins", async () => {
    useAuth.mockReturnValue({ user: { role: "user" } });
    mockRole("user");
    renderDetail();
    await waitForLoaded();

    expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
  });

  it("lets an admin add a donation", async () => {
    useAuth.mockReturnValue({ user: { role: "admin" } });
    mockRole("admin");
    const posted = [];
    server.use(
      http.post(`${API_BASE_URL}/organisations/org-1/donations`, async ({ request }) => {
        posted.push(await request.json());
        return HttpResponse.json({ ...CURRENT_DONATION, id: "don-new" }, { status: 201 });
      }),
    );

    renderDetail();
    await waitForLoaded();

    await userEvent.type(screen.getByLabelText("Amount"), "125.50");
    await userEvent.type(screen.getByLabelText("Date"), `${THIS_YEAR}-10-01`);
    await userEvent.click(screen.getByRole("button", { name: /add donation/i }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].amount).toBe(125.5);
    expect(posted[0].donation_date).toBe(`${THIS_YEAR}-10-01`);
  });
});
