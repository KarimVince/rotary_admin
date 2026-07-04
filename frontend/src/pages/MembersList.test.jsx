import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../hooks/useAuth";
import { server } from "../test/mocks/server";
import MembersList from "./MembersList";

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
  profession: null,
  classification: null,
  nationality: "France",
  is_couple: false,
  notes: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
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
    });

    it("shows the member with its title initial and the write controls", async () => {
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER])),
      );

      renderMembersList();
      await waitForLoaded();

      expect(screen.getByText("P Jane Doe")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /add member/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^edit$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /mark as past/i })).toBeInTheDocument();
    });

    it("filters the visible list by the search box", async () => {
      const secondMember = { ...MEMBER, id: "member-2", first_name: "Bob", last_name: "Smith", title_id: null, email: "bob@example.com" };
      server.use(
        http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER, secondMember])),
      );

      renderMembersList();
      await waitForLoaded();

      expect(screen.getByText("P Jane Doe")).toBeInTheDocument();
      expect(screen.getByText("Bob Smith")).toBeInTheDocument();

      await userEvent.type(screen.getByLabelText(/search/i), "bob");

      expect(screen.queryByText("P Jane Doe")).not.toBeInTheDocument();
      expect(screen.getByText("Bob Smith")).toBeInTheDocument();
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

      await userEvent.type(screen.getByLabelText(/first name/i), "New");
      await userEvent.type(screen.getByLabelText(/last name/i), "Member");
      await userEvent.type(screen.getByLabelText(/join date/i), "2024-05-01");
      await userEvent.click(screen.getByRole("button", { name: /^add member$/i }));

      expect(await screen.findByText("New Member")).toBeInTheDocument();
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

      await userEvent.type(screen.getByLabelText(/first name/i), "New");
      await userEvent.type(screen.getByLabelText(/last name/i), "Member");
      await userEvent.type(screen.getByLabelText(/join date/i), "2024-05-01");
      await userEvent.click(screen.getByRole("button", { name: /^add member$/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        /email already registered to another member/i,
      );
    });

    it("edits a member via the same form", async () => {
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

      await userEvent.click(screen.getByRole("button", { name: /^edit$/i }));
      expect(screen.getByRole("heading", { name: /edit member/i })).toBeInTheDocument();

      await userEvent.type(screen.getByLabelText(/phone/i), "555-0000");
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

      await userEvent.click(screen.getByRole("button", { name: /mark as past/i }));

      await waitFor(() =>
        expect(screen.getByRole("table").textContent).toContain("Past"),
      );
      window.confirm.mockRestore();
    });
  });

  describe("as a non-admin user", () => {
    beforeEach(() => {
      useAuth.mockReturnValue({ user: { role: "user", full_name: "Regular User" } });
    });

    it("shows the directory without any write controls", async () => {
      server.use(http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([MEMBER])));

      renderMembersList();
      await waitForLoaded();

      expect(screen.getByText("P Jane Doe")).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: /add member/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /mark as past/i })).not.toBeInTheDocument();
    });
  });
});
