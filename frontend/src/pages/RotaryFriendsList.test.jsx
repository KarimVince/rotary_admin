import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../hooks/useAuth";
import { server } from "../test/mocks/server";
import RotaryFriendsList from "./RotaryFriendsList";

vi.mock("../hooks/useAuth");

const API_BASE_URL = "http://localhost:8000/api/v1";

const FRIEND_A = {
  id: "friend-a",
  first_name: "Sara",
  last_name: "Nguyen",
  email: "sara@example.com",
  whatsapp: "+33612345678",
  tags: "donor, alumni",
  source: "Charity gala 2024",
  notes: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const FRIEND_B = {
  ...FRIEND_A,
  id: "friend-b",
  first_name: "Jamie",
  last_name: "Lee",
  email: "jamie@example.com",
  tags: "sponsor",
  source: "Golf tournament",
};

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
}

describe("RotaryFriendsList", () => {
  beforeEach(() => {
    server.use(
      http.get(`${API_BASE_URL}/rotary-friends`, () =>
        HttpResponse.json([FRIEND_A, FRIEND_B]),
      ),
    );
  });

  it("lists Rotary friends for an authenticated user", async () => {
    useAuth.mockReturnValue({ user: { role: "user" } });
    render(<RotaryFriendsList />);
    await waitForLoaded();

    expect(screen.getByText("Sara Nguyen")).toBeInTheDocument();
    expect(screen.getByText("Jamie Lee")).toBeInTheDocument();
  });

  it("does not show the Add button for non-admins", async () => {
    useAuth.mockReturnValue({ user: { role: "user" } });
    render(<RotaryFriendsList />);
    await waitForLoaded();

    expect(screen.queryByRole("button", { name: /add friend/i })).not.toBeInTheDocument();
  });

  it("filters friends by the search box", async () => {
    useAuth.mockReturnValue({ user: { role: "user" } });
    render(<RotaryFriendsList />);
    await waitForLoaded();

    await userEvent.type(screen.getByLabelText("Search"), "sara");

    expect(screen.getByText("Sara Nguyen")).toBeInTheDocument();
    expect(screen.queryByText("Jamie Lee")).not.toBeInTheDocument();
  });

  it("filters friends by tag", async () => {
    useAuth.mockReturnValue({ user: { role: "user" } });
    render(<RotaryFriendsList />);
    await waitForLoaded();

    await userEvent.selectOptions(screen.getByLabelText("Tag"), "sponsor");

    expect(screen.getByText("Jamie Lee")).toBeInTheDocument();
    expect(screen.queryByText("Sara Nguyen")).not.toBeInTheDocument();
  });

  it("filters friends by source", async () => {
    useAuth.mockReturnValue({ user: { role: "user" } });
    render(<RotaryFriendsList />);
    await waitForLoaded();

    await userEvent.selectOptions(screen.getByLabelText("Source"), "Golf tournament");

    expect(screen.getByText("Jamie Lee")).toBeInTheDocument();
    expect(screen.queryByText("Sara Nguyen")).not.toBeInTheDocument();
  });

  it("blocks submission when neither email nor whatsapp is provided", async () => {
    useAuth.mockReturnValue({ user: { role: "admin" } });
    render(<RotaryFriendsList />);
    await waitForLoaded();

    await userEvent.click(screen.getByRole("button", { name: /add friend/i }));
    await userEvent.type(screen.getByLabelText(/first name/i), "No");
    await userEvent.type(screen.getByLabelText(/last name/i), "Contact");
    await userEvent.click(screen.getByRole("button", { name: /save friend/i }));

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent(/either email or whatsapp is required/i);
  });

  it("lets an admin create a friend", async () => {
    useAuth.mockReturnValue({ user: { role: "admin" } });
    const posted = [];
    server.use(
      http.post(`${API_BASE_URL}/rotary-friends`, async ({ request }) => {
        posted.push(await request.json());
        return HttpResponse.json(
          { ...FRIEND_A, id: "friend-new", first_name: "New" },
          { status: 201 },
        );
      }),
    );

    render(<RotaryFriendsList />);
    await waitForLoaded();

    await userEvent.click(screen.getByRole("button", { name: /add friend/i }));
    await userEvent.type(screen.getByLabelText(/first name/i), "New");
    await userEvent.type(screen.getByLabelText(/last name/i), "Friend");
    await userEvent.type(screen.getByLabelText(/email/i), "new@example.com");
    await userEvent.click(screen.getByRole("button", { name: /save friend/i }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].first_name).toBe("New");
  });

  it("lets an admin delete a friend after confirmation", async () => {
    useAuth.mockReturnValue({ user: { role: "admin" } });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let friendDeleted = false;
    server.use(
      http.delete(`${API_BASE_URL}/rotary-friends/${FRIEND_A.id}`, () => {
        friendDeleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
      // Single GET handler that returns the right list both before and after delete,
      // preventing the two separate server.use() calls from shadowing each other.
      http.get(`${API_BASE_URL}/rotary-friends`, () =>
        HttpResponse.json(friendDeleted ? [FRIEND_B] : [FRIEND_A, FRIEND_B]),
      ),
    );

    render(<RotaryFriendsList />);
    await waitForLoaded();

    await userEvent.click(screen.getAllByRole("button", { name: /^delete$/i })[0]);

    // Wait for the post-delete reload to complete so no in-flight GET request remains
    // when afterEach resets the MSW handlers.
    await screen.findByText("Jamie Lee");
    expect(screen.queryByText("Sara Nguyen")).not.toBeInTheDocument();
  });

  describe("CSV import", () => {
    it("previews a CSV file, flags errors/duplicates, and imports the valid rows", async () => {
      useAuth.mockReturnValue({ user: { role: "admin" } });
      let committedBody;
      server.use(
        http.post(`${API_BASE_URL}/rotary-friends/import/preview`, () =>
          HttpResponse.json({
            rows: [
              {
                row_number: 2,
                first_name: "New",
                last_name: "Person",
                email: "new@example.com",
                whatsapp: null,
                tags: null,
                source: null,
                notes: null,
                errors: [],
                is_duplicate: false,
              },
              {
                row_number: 3,
                first_name: "Sara",
                last_name: "Nguyen",
                email: "sara@example.com",
                whatsapp: null,
                tags: null,
                source: null,
                notes: null,
                errors: [],
                is_duplicate: true,
              },
              {
                row_number: 4,
                first_name: "No",
                last_name: "Contact",
                email: null,
                whatsapp: null,
                tags: null,
                source: null,
                notes: null,
                errors: ["Either email or whatsapp is required"],
                is_duplicate: false,
              },
            ],
            valid_count: 1,
            error_count: 1,
            duplicate_count: 1,
          }),
        ),
        http.post(`${API_BASE_URL}/rotary-friends/import`, async ({ request }) => {
          committedBody = await request.json();
          return HttpResponse.json({
            created_count: 1,
            skipped_count: 0,
            skipped_emails: [],
          });
        }),
      );

      render(<RotaryFriendsList />);
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: /import csv/i }));
      const file = new File(["name,email\nNew Person,new@example.com"], "friends.csv", {
        type: "text/csv",
      });
      await userEvent.upload(screen.getByLabelText(/csv file/i), file);

      expect(await screen.findByText(/1 valid, 1 with errors, 1 duplicate/i)).toBeInTheDocument();
      expect(screen.getByText(/either email or whatsapp is required/i)).toBeInTheDocument();
      expect(screen.getByText(/duplicate — skipped/i)).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: /import 1 friend/i }));

      await waitFor(() =>
        expect(committedBody).toEqual({
          friends: [
            {
              first_name: "New",
              last_name: "Person",
              email: "new@example.com",
              whatsapp: null,
              tags: null,
              source: null,
              notes: null,
            },
          ],
        }),
      );
      expect(await screen.findByText(/imported 1 friend/i)).toBeInTheDocument();
    });

    it("shows an error when the CSV fails to parse", async () => {
      useAuth.mockReturnValue({ user: { role: "admin" } });
      server.use(
        http.post(`${API_BASE_URL}/rotary-friends/import/preview`, () =>
          HttpResponse.json({ detail: "CSV file is empty" }, { status: 422 }),
        ),
      );

      render(<RotaryFriendsList />);
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: /import csv/i }));
      const file = new File([""], "empty.csv", { type: "text/csv" });
      await userEvent.upload(screen.getByLabelText(/csv file/i), file);

      expect(await screen.findByRole("alert")).toHaveTextContent(/csv file is empty/i);
    });
  });

  describe("CSV export", () => {
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

    it("downloads a CSV export", async () => {
      useAuth.mockReturnValue({ user: { role: "admin" } });
      server.use(
        http.get(`${API_BASE_URL}/rotary-friends/export`, () =>
          new HttpResponse("first_name,last_name,email\nSara,Nguyen,sara@example.com", {
            headers: {
              "Content-Type": "text/csv",
              "Content-Disposition": 'attachment; filename="rotary_friends.csv"',
            },
          }),
        ),
      );

      render(<RotaryFriendsList />);
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: /export csv/i }));

      await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    });
  });
});
