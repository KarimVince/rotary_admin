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

const MEMBERS = [
  { id: "member-1", first_name: "Jane", last_name: "Doe" },
  { id: "member-2", first_name: "John", last_name: "Smith" },
];

const CURRENT_SERVICE_HOUR = {
  id: "svc-current",
  organisation_id: "org-1",
  member_id: "member-1",
  member_name: "Jane Doe",
  rotary_year: THIS_YEAR,
  hours: 4,
  service_date: `${THIS_YEAR}-09-05`,
  notes: "Well maintenance",
  created_by: "user-1",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const PAST_SERVICE_HOUR = {
  ...CURRENT_SERVICE_HOUR,
  id: "svc-past",
  rotary_year: THIS_YEAR - 2,
  hours: 6,
  service_date: `${THIS_YEAR - 2}-09-05`,
  notes: "Site survey",
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
      // Story 16.14 — service hours + the member list backing the "Add
      // services" member-name dropdown.
      http.get(`${API_BASE_URL}/organisations/org-1/service-hours`, () =>
        HttpResponse.json([CURRENT_SERVICE_HOUR, PAST_SERVICE_HOUR]),
      ),
      http.get(`${API_BASE_URL}/members`, () => HttpResponse.json(MEMBERS)),
      // Story 11.4 — fetched non-fatally on mount for the classification
      // badge; default to empty so existing tests don't need to know about it.
      http.get(`${API_BASE_URL}/ngo-classifications`, () => HttpResponse.json([])),
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

    const donationSection = screen
      .getByRole("heading", { name: /^add donation$/i })
      .closest("section");

    await userEvent.type(within(donationSection).getByLabelText("Amount"), "125.50");
    await userEvent.type(within(donationSection).getByLabelText("Date"), `${THIS_YEAR}-10-01`);
    await userEvent.click(within(donationSection).getByRole("button", { name: /add donation/i }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].amount).toBe(125.5);
    expect(posted[0].donation_date).toBe(`${THIS_YEAR}-10-01`);
  });

  describe("Service hours (Story 16.14)", () => {
    it("shows total hours (all years + current year) and buckets entries by year", async () => {
      useAuth.mockReturnValue({ user: { role: "user" } });
      mockRole("user");
      renderDetail();
      await waitForLoaded();

      expect(screen.getByText(/Total service hours \(all years\)/i)).toHaveTextContent("10.0 h");
      expect(screen.getByText(/Total service hours \(all years\)/i)).toHaveTextContent(
        "Current year",
      );
      expect(screen.getByText(/Total service hours \(all years\)/i)).toHaveTextContent("4.0 h");

      expect(screen.getByText("Well maintenance")).toBeInTheDocument();
      expect(screen.getByText("Site survey")).toBeInTheDocument();
      expect(screen.getAllByText("Jane Doe")).not.toHaveLength(0);
    });

    it("hides the add-services form from non-admins", async () => {
      useAuth.mockReturnValue({ user: { role: "user" } });
      mockRole("user");
      renderDetail();
      await waitForLoaded();

      expect(screen.queryByLabelText("Member name")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Time (hours)")).not.toBeInTheDocument();
    });

    it("lets an admin add a service hours entry with a member picked from the dropdown", async () => {
      useAuth.mockReturnValue({ user: { role: "admin" } });
      mockRole("admin");
      const posted = [];
      server.use(
        http.post(`${API_BASE_URL}/organisations/org-1/service-hours`, async ({ request }) => {
          posted.push(await request.json());
          return HttpResponse.json({ ...CURRENT_SERVICE_HOUR, id: "svc-new" }, { status: 201 });
        }),
      );

      renderDetail();
      await waitForLoaded();

      const servicesSection = screen
        .getByRole("heading", { name: /^add services$/i })
        .closest("section");

      await userEvent.selectOptions(within(servicesSection).getByLabelText("Member name"), "member-2");
      await userEvent.type(within(servicesSection).getByLabelText("Time (hours)"), "3.5");
      await userEvent.type(within(servicesSection).getByLabelText("Date"), `${THIS_YEAR}-10-01`);
      await userEvent.click(within(servicesSection).getByRole("button", { name: /^add services$/i }));

      await waitFor(() => expect(posted).toHaveLength(1));
      expect(posted[0].member_id).toBe("member-2");
      expect(posted[0].hours).toBe(3.5);
      expect(posted[0].service_date).toBe(`${THIS_YEAR}-10-01`);
    });

    it("deletes a service hours entry after confirmation", async () => {
      useAuth.mockReturnValue({ user: { role: "admin" } });
      mockRole("admin");
      let deleted = false;
      server.use(
        http.delete(`${API_BASE_URL}/service-hours/svc-current`, () => {
          deleted = true;
          return new HttpResponse(null, { status: 204 });
        }),
      );
      vi.spyOn(window, "confirm").mockReturnValue(true);

      renderDetail();
      await waitForLoaded();

      const row = screen.getByText("Well maintenance").closest("tr");
      await userEvent.click(within(row).getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(deleted).toBe(true));
      window.confirm.mockRestore();
    });
  });
});
