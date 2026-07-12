import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../hooks/useAuth";
import { server } from "../test/mocks/server";
import MembersList from "./MembersList";

let mockCanRead = true;
let mockCanWrite = false;
vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: mockCanRead, canWrite: mockCanWrite }),
}));

function mockRole(role) {
  mockCanRead = true;
  mockCanWrite = role === "admin";
}

function renderMembersList() {
  return render(
    <MemoryRouter>
      <MembersList />
    </MemoryRouter>,
  );
}

vi.mock("../hooks/useAuth");

const API_BASE_URL = "http://localhost:8000/api/v1";

const TITLE = {
  id: "title-1",
  code: "P",
  label: "President",
  sort_order: 0,
  is_active: true,
  created_at: new Date().toISOString(),
};

const MEMBER = {
  id: "member-1",
  first_name: "Jane",
  last_name: "Doe",
  email: "jane@example.com",
  phone: null,
  status: "active",
  title_id: "title-1",
  join_date: "2020-01-15",
  leave_date: null,
  rotarian_since: null,
  rotarian_id: null,
  photo_url: null,
  profession: null,
  classification: null,
  gender: null,
  nationality: "France",
  is_couple: false,
  is_honorary: false,
  notes: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  years_as_rotarian: 6,
  years_in_this_club: 6,
};

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
}

describe("MembersList", () => {
  beforeEach(() => {
    server.use(http.get(`${API_BASE_URL}/member-titles`, () => HttpResponse.json([TITLE])));
  });

  describe("as admin", () => {
    beforeEach(() => {
      useAuth.mockReturnValue({ user: { role: "admin", full_name: "Admin" } });
      mockRole("admin");
    });

    it("shows the member card with title badge and an Add Member button", async () => {
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER])),
      );

      renderMembersList();
      await waitForLoaded();

      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
      expect(screen.getByText("P")).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: /add member/i })).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: /add member/i }));

      expect(screen.getByRole("heading", { name: /add member/i })).toBeInTheDocument();
    });

    it("opens member detail with edit and mark-as-past controls on card click", async () => {
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER])),
      );

      renderMembersList();
      await waitForLoaded();

      await userEvent.click(screen.getByText("Jane Doe"));

      expect(screen.getByRole("heading", { name: /jane doe/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^edit$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /mark as past/i })).toBeInTheDocument();
    });

    it("groups member detail info into Personal info / Membership & tenure / Notes cards", async () => {
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER])),
      );

      renderMembersList();
      await waitForLoaded();

      await userEvent.click(screen.getByText("Jane Doe"));

      expect(screen.getByText("Personal info")).toBeInTheDocument();
      expect(screen.getByText(/membership & tenure/i)).toBeInTheDocument();
      expect(screen.getByText("Notes")).toBeInTheDocument();
      expect(screen.getByText(/email: jane@example\.com/i)).toBeInTheDocument();
      expect(screen.getByText(/join date: 2020-01-15/i)).toBeInTheDocument();
    });

    it("filters the visible list by the search box", async () => {
      const secondMember = { ...MEMBER, id: "member-2", first_name: "Bob", last_name: "Smith", title_id: null, email: "bob@example.com" };
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER, secondMember])),
      );

      renderMembersList();
      await waitForLoaded();

      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
      expect(screen.getByText("Bob Smith")).toBeInTheDocument();

      await userEvent.type(screen.getByLabelText(/search/i), "bob");

      expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument();
      expect(screen.getByText("Bob Smith")).toBeInTheDocument();
    });

    it("shows an empty-state message when the search matches nobody", async () => {
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER])),
      );

      renderMembersList();
      await waitForLoaded();

      await userEvent.type(screen.getByLabelText(/search/i), "nobody-matches-this");

      expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument();
      expect(screen.getByText(/no members match/i)).toBeInTheDocument();
    });

    it("creates a member via the form", async () => {
      let members = [];
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json(members)),
        http.post(`${API_BASE_URL}/members`, async ({ request }) => {
          const body = await request.json();
          const created = { ...MEMBER, id: "member-3", title_id: null, ...body };
          members = [created];
          return HttpResponse.json(created, { status: 201 });
        }),
      );

      renderMembersList();
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: /add member/i }));
      await userEvent.type(screen.getByLabelText(/first name/i), "New");
      await userEvent.type(screen.getByLabelText(/last name/i), "Member");
      await userEvent.type(screen.getByLabelText(/join date/i), "2024-05-01");
      await userEvent.click(screen.getByRole("button", { name: /^save member$/i }));

      expect(await screen.findByText("New Member")).toBeInTheDocument();
    });

    it("includes the selected gender when creating a member", async () => {
      let capturedBody;
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([])),
        http.post(`${API_BASE_URL}/members`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({ ...MEMBER, ...capturedBody, id: "member-5" }, { status: 201 });
        }),
      );

      renderMembersList();
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: /add member/i }));
      await userEvent.type(screen.getByLabelText(/first name/i), "New");
      await userEvent.type(screen.getByLabelText(/last name/i), "Member");
      await userEvent.type(screen.getByLabelText(/join date/i), "2024-05-01");
      await userEvent.selectOptions(screen.getByLabelText(/gender/i), "Female");
      await userEvent.click(screen.getByRole("button", { name: /^save member$/i }));

      await waitFor(() => expect(capturedBody?.gender).toBe("Female"));
    });

    it("includes the honorary flag (Story 8.14) when creating a member", async () => {
      let capturedBody;
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([])),
        http.post(`${API_BASE_URL}/members`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({ ...MEMBER, ...capturedBody, id: "member-8" }, { status: 201 });
        }),
      );

      renderMembersList();
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: /add member/i }));
      await userEvent.type(screen.getByLabelText(/first name/i), "New");
      await userEvent.type(screen.getByLabelText(/last name/i), "Member");
      await userEvent.type(screen.getByLabelText(/join date/i), "2024-05-01");
      await userEvent.click(screen.getByLabelText(/honorary member/i));
      await userEvent.click(screen.getByRole("button", { name: /^save member$/i }));

      await waitFor(() => expect(capturedBody?.status).toBe("active"));
      expect(capturedBody?.is_honorary).toBe(true);
    });

    it("has only Active and Past as status options (Story 8.14)", async () => {
      server.use(http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([])));

      renderMembersList();
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: /add member/i }));
      const modal = screen.getByRole("heading", { name: /add member/i }).closest(".modal-dialog");
      const statusSelect = within(modal).getByLabelText(/^status$/i);
      const optionValues = within(statusSelect)
        .getAllByRole("option")
        .map((option) => option.value);
      expect(optionValues).toEqual(["active", "past"]);
    });

    it("disables the honorary checkbox when status is Past", async () => {
      server.use(http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([])));

      renderMembersList();
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: /add member/i }));
      const modal = screen.getByRole("heading", { name: /add member/i }).closest(".modal-dialog");
      await userEvent.selectOptions(within(modal).getByLabelText(/^status$/i), "past");

      expect(screen.getByLabelText(/honorary member/i)).toBeDisabled();
    });

    it("submits a nationality selected from the fixed country list", async () => {
      let capturedBody;
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([])),
        http.post(`${API_BASE_URL}/members`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({ ...MEMBER, ...capturedBody, id: "member-7" }, { status: 201 });
        }),
      );

      renderMembersList();
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: /add member/i }));
      await userEvent.type(screen.getByLabelText(/first name/i), "New");
      await userEvent.type(screen.getByLabelText(/last name/i), "Member");
      await userEvent.type(screen.getByLabelText(/join date/i), "2024-05-01");
      const addModal = screen.getByRole("heading", { name: /add member/i }).closest(".modal-dialog");
      await userEvent.type(within(addModal).getByLabelText(/nationality/i), "Japan");
      await userEvent.click(screen.getByRole("button", { name: /^save member$/i }));

      await waitFor(() => expect(capturedBody?.nationality).toBe("Japan"));
    });

    it("rejects a nationality outside the fixed country list without hitting the server", async () => {
      let wasCalled = false;
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([])),
        http.post(`${API_BASE_URL}/members`, () => {
          wasCalled = true;
          return HttpResponse.json({}, { status: 201 });
        }),
      );

      renderMembersList();
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: /add member/i }));
      await userEvent.type(screen.getByLabelText(/first name/i), "New");
      await userEvent.type(screen.getByLabelText(/last name/i), "Member");
      await userEvent.type(screen.getByLabelText(/join date/i), "2024-05-01");
      const addModal = screen.getByRole("heading", { name: /add member/i }).closest(".modal-dialog");
      await userEvent.type(within(addModal).getByLabelText(/nationality/i), "Not A Country");
      await userEvent.click(screen.getByRole("button", { name: /^save member$/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        /nationality must be selected from the list of countries/i,
      );
      expect(wasCalled).toBe(false);
    });

    it("includes the entered Rotarian ID when creating a member", async () => {
      let capturedBody;
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([])),
        http.post(`${API_BASE_URL}/members`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({ ...MEMBER, ...capturedBody, id: "member-6" }, { status: 201 });
        }),
      );

      renderMembersList();
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: /add member/i }));
      await userEvent.type(screen.getByLabelText(/first name/i), "New");
      await userEvent.type(screen.getByLabelText(/last name/i), "Member");
      await userEvent.type(screen.getByLabelText(/join date/i), "2024-05-01");
      await userEvent.type(screen.getByLabelText(/rotarian id/i), "RI-9009");
      await userEvent.click(screen.getByRole("button", { name: /^save member$/i }));

      await waitFor(() => expect(capturedBody?.rotarian_id).toBe("RI-9009"));
    });

    it("shows a clear error when saving a duplicate Rotarian ID", async () => {
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([])),
        http.post(`${API_BASE_URL}/members`, () =>
          HttpResponse.json(
            { detail: "Rotarian ID already registered to another member" },
            { status: 409 },
          ),
        ),
      );

      renderMembersList();
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: /add member/i }));
      await userEvent.type(screen.getByLabelText(/first name/i), "New");
      await userEvent.type(screen.getByLabelText(/last name/i), "Member");
      await userEvent.type(screen.getByLabelText(/join date/i), "2024-05-01");
      await userEvent.type(screen.getByLabelText(/rotarian id/i), "RI-9009");
      await userEvent.click(screen.getByRole("button", { name: /^save member$/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        /rotarian id already registered to another member/i,
      );
    });

    it("shows the Rotarian ID in the member detail view but not on the card", async () => {
      const memberWithRi = { ...MEMBER, rotarian_id: "RI-7007" };
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([memberWithRi])),
      );

      renderMembersList();
      await waitForLoaded();

      expect(screen.queryByText(/RI-7007/)).not.toBeInTheDocument();

      await userEvent.click(screen.getByText("Jane Doe"));
      expect(screen.getByText(/RI-7007/)).toBeInTheDocument();
    });

    it("uploads a photo and includes its returned URL when saving", async () => {
      let capturedBody;
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([])),
        http.post(`${API_BASE_URL}/members/photo`, () =>
          HttpResponse.json({ photo_url: "/static/members/abc123.png" }, { status: 201 }),
        ),
        http.post(`${API_BASE_URL}/members`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({ ...MEMBER, ...capturedBody, id: "member-4" }, { status: 201 });
        }),
      );

      renderMembersList();
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: /add member/i }));
      await userEvent.type(screen.getByLabelText(/first name/i), "New");
      await userEvent.type(screen.getByLabelText(/last name/i), "Member");
      await userEvent.type(screen.getByLabelText(/join date/i), "2024-05-01");

      const file = new File(["fake-bytes"], "photo.png", { type: "image/png" });
      await userEvent.upload(screen.getByLabelText(/^photo$/i), file);
      await screen.findByAltText("Preview");

      await userEvent.click(screen.getByRole("button", { name: /^save member$/i }));

      await waitFor(() => expect(capturedBody?.photo_url).toBe("/static/members/abc123.png"));
    });

    it("shows an error when saving fails", async () => {
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([])),
        http.post(`${API_BASE_URL}/members`, () =>
          HttpResponse.json(
            { detail: "Email already registered to another member" },
            { status: 409 },
          ),
        ),
      );

      renderMembersList();
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: /add member/i }));
      await userEvent.type(screen.getByLabelText(/first name/i), "New");
      await userEvent.type(screen.getByLabelText(/last name/i), "Member");
      await userEvent.type(screen.getByLabelText(/join date/i), "2024-05-01");
      await userEvent.click(screen.getByRole("button", { name: /^save member$/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        /email already registered to another member/i,
      );
    });

    it("edits a member via the same form after opening its detail", async () => {
      let member = { ...MEMBER };
      let capturedBody;
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([member])),
        http.patch(`${API_BASE_URL}/members/${MEMBER.id}`, async ({ request }) => {
          capturedBody = await request.json();
          member = { ...member, ...capturedBody };
          return HttpResponse.json(member);
        }),
      );

      renderMembersList();
      await waitForLoaded();

      await userEvent.click(screen.getByText("Jane Doe"));
      await userEvent.click(screen.getByRole("button", { name: /^edit$/i }));
      expect(screen.getByRole("heading", { name: /edit member/i })).toBeInTheDocument();

      await userEvent.type(screen.getByLabelText(/^phone$/i), "555-0000");
      await userEvent.click(screen.getByRole("button", { name: /update member/i }));

      await waitFor(() => expect(capturedBody?.phone).toBe("555-0000"));
      expect(screen.queryByRole("heading", { name: /edit member/i })).not.toBeInTheDocument();
    });

    it("marks a member as past after confirmation", async () => {
      let member = { ...MEMBER };
      vi.spyOn(window, "confirm").mockReturnValue(true);
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([member])),
        http.delete(`${API_BASE_URL}/members/${MEMBER.id}`, () => {
          member = { ...member, status: "past" };
          return HttpResponse.json(member);
        }),
      );

      renderMembersList();
      await waitForLoaded();

      await userEvent.click(screen.getByText("Jane Doe"));
      await userEvent.click(screen.getByRole("button", { name: /mark as past/i }));

      await waitFor(() =>
        expect(screen.queryByRole("heading", { name: /jane doe/i })).not.toBeInTheDocument(),
      );

      await userEvent.click(screen.getByText("Jane Doe"));
      expect(screen.getByText(/status: past/i)).toBeInTheDocument();

      window.confirm.mockRestore();
    });
  });

  describe("as a non-admin user", () => {
    beforeEach(() => {
      useAuth.mockReturnValue({ user: { role: "user", full_name: "Regular User" } });
      mockRole("user");
    });

    it("shows the directory without any write controls", async () => {
      server.use(http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER])));

      renderMembersList();
      await waitForLoaded();

      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /add member/i })).not.toBeInTheDocument();

      await userEvent.click(screen.getByText("Jane Doe"));
      expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /mark as past/i })).not.toBeInTheDocument();
    });
  });

  describe("as a user with matrix write access (e.g. a board position)", () => {
    beforeEach(() => {
      useAuth.mockReturnValue({
        user: { role: "user", full_name: "Board Member", member_id: MEMBER.id },
      });
      mockCanRead = true;
      mockCanWrite = true;
    });

    it("can edit a member record but still has no Mark as past (admin-only)", async () => {
      let capturedBody;
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER])),
        http.patch(`${API_BASE_URL}/members/${MEMBER.id}`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({ ...MEMBER, ...capturedBody });
        }),
      );

      renderMembersList();
      await waitForLoaded();

      expect(screen.getByRole("button", { name: /add member/i })).toBeInTheDocument();

      await userEvent.click(screen.getByText("Jane Doe"));
      expect(screen.queryByRole("button", { name: /mark as past/i })).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: /^edit$/i }));
      expect(screen.getByRole("heading", { name: /edit member/i })).toBeInTheDocument();

      await userEvent.type(screen.getByLabelText(/^phone$/i), "555-9999");
      await userEvent.click(screen.getByRole("button", { name: /update member/i }));

      await waitFor(() => expect(capturedBody?.phone).toBe("555-9999"));
    });
  });
});
