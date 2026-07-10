import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../hooks/useAuth";
import { server } from "../test/mocks/server";
import OrganisationsList from "./OrganisationsList";

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

const ORG_A = {
  id: "org-a",
  name: "Clean Water Project",
  description: null,
  contact_name: "Sara",
  contact_email: null,
  contact_phone: null,
  country: "Chad",
  first_supported_year: 2019,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const ORG_B = {
  ...ORG_A,
  id: "org-b",
  name: "Library Fund",
  country: "France",
  contact_name: "Paul",
  first_supported_year: 2021,
};

function renderList() {
  return render(
    <MemoryRouter>
      <OrganisationsList />
    </MemoryRouter>,
  );
}

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
}

describe("OrganisationsList", () => {
  beforeEach(() => {
    server.use(
      http.get(`${API_BASE_URL}/organisations`, () => HttpResponse.json([ORG_A, ORG_B])),
      // Story 11.4/11.5 — fetched non-fatally on mount for the badge/filter;
      // default to empty so existing tests don't need to know about it.
      http.get(`${API_BASE_URL}/ngo-classifications`, () => HttpResponse.json([])),
    );
  });

  it("lists organisations for an authenticated user", async () => {
    useAuth.mockReturnValue({ user: { role: "user" } });
    mockRole("user");
    renderList();
    await waitForLoaded();

    expect(screen.getByText("Clean Water Project")).toBeInTheDocument();
    expect(screen.getByText("Library Fund")).toBeInTheDocument();
  });

  it("does not show the Add button for non-admins", async () => {
    useAuth.mockReturnValue({ user: { role: "user" } });
    mockRole("user");
    renderList();
    await waitForLoaded();

    expect(screen.queryByRole("button", { name: /add organisation/i })).not.toBeInTheDocument();
  });

  it("filters organisations by the search box", async () => {
    useAuth.mockReturnValue({ user: { role: "user" } });
    mockRole("user");
    renderList();
    await waitForLoaded();

    await userEvent.type(screen.getByLabelText("Search"), "water");

    expect(screen.getByText("Clean Water Project")).toBeInTheDocument();
    expect(screen.queryByText("Library Fund")).not.toBeInTheDocument();
  });

  it("lets an admin create an organisation", async () => {
    useAuth.mockReturnValue({ user: { role: "admin" } });
    mockRole("admin");
    const posted = [];
    server.use(
      http.post(`${API_BASE_URL}/organisations`, async ({ request }) => {
        posted.push(await request.json());
        return HttpResponse.json({ ...ORG_A, id: "org-new", name: "New Org" }, { status: 201 });
      }),
    );

    renderList();
    await waitForLoaded();

    await userEvent.click(screen.getByRole("button", { name: /add organisation/i }));
    await userEvent.type(screen.getByLabelText("Name"), "New Org");
    await userEvent.click(screen.getByRole("button", { name: /save organisation/i }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].name).toBe("New Org");
  });
});
