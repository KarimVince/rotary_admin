import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import ReferenceLists from "./ReferenceLists";

const API_BASE_URL = "http://localhost:8000/api/v1";

let permissionsByKey = {};
vi.mock("../hooks/useAccess", () => ({
  useAccess: (key) => permissionsByKey[key] ?? { canRead: true, canWrite: true },
}));

function allAllowed() {
  permissionsByKey = {
    "admin.member_titles": { canRead: true, canWrite: true },
    "admin.honorifics": { canRead: true, canWrite: true },
    "admin.ngo_classifications": { canRead: true, canWrite: true },
    "admin.dinner_event_types": { canRead: true, canWrite: true },
  };
}

function mockEmptyLists() {
  server.use(
    http.get(`${API_BASE_URL}/member-titles`, () => HttpResponse.json([])),
    http.get(`${API_BASE_URL}/honorifics`, () => HttpResponse.json([])),
    http.get(`${API_BASE_URL}/ngo-classifications`, () => HttpResponse.json([])),
    http.get(`${API_BASE_URL}/dinner-event-types`, () => HttpResponse.json([])),
  );
}

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryAllByText(/^loading…$/i)).toHaveLength(0));
}

describe("ReferenceLists", () => {
  describe("Member Titles card", () => {
    const BASE_TITLE = {
      id: "title-1",
      code: "Rtn",
      label: "Rotarian",
      sort_order: 0,
      is_active: true,
      created_at: new Date().toISOString(),
    };

    it("lists titles fetched from the API", async () => {
      allAllowed();
      mockEmptyLists();
      server.use(http.get(`${API_BASE_URL}/member-titles`, () => HttpResponse.json([BASE_TITLE])));

      render(<ReferenceLists />);
      await waitForLoaded();

      const card = within(screen.getByRole("region", { name: "Member Titles" }));
      expect(card.getByText("Rtn")).toBeInTheDocument();
      expect(card.getByText("Rotarian")).toBeInTheDocument();
    });

    it("creates a title and refreshes the list", async () => {
      allAllowed();
      mockEmptyLists();
      let titles = [];
      server.use(
        http.get(`${API_BASE_URL}/member-titles`, () => HttpResponse.json(titles)),
        http.post(`${API_BASE_URL}/member-titles`, async ({ request }) => {
          const body = await request.json();
          const created = { ...BASE_TITLE, id: "title-2", is_active: true, ...body };
          titles = [created];
          return HttpResponse.json(created, { status: 201 });
        }),
      );

      render(<ReferenceLists />);
      await waitForLoaded();

      const card = within(screen.getByRole("region", { name: "Member Titles" }));
      await userEvent.type(card.getByLabelText(/code/i), "PP");
      await userEvent.type(card.getByLabelText(/label/i), "Past President");
      await userEvent.click(card.getByRole("button", { name: /add title/i }));

      expect(await card.findByText("PP")).toBeInTheDocument();
    });

    it("toggles a title's active status", async () => {
      allAllowed();
      mockEmptyLists();
      let title = { ...BASE_TITLE };
      server.use(
        http.get(`${API_BASE_URL}/member-titles`, () => HttpResponse.json([title])),
        http.delete(`${API_BASE_URL}/member-titles/${BASE_TITLE.id}`, () => {
          title = { ...title, is_active: false };
          return HttpResponse.json(title);
        }),
      );

      render(<ReferenceLists />);
      await waitForLoaded();

      const card = within(screen.getByRole("region", { name: "Member Titles" }));
      expect(card.getByText("Active")).toBeInTheDocument();

      await userEvent.click(card.getByRole("button", { name: /deactivate/i }));

      expect(await card.findByText("Inactive")).toBeInTheDocument();
    });
  });

  describe("Honorifics card", () => {
    const BASE_HONORIFIC = {
      id: "honorific-1",
      code: "MR",
      label: "Mr.",
      sort_order: 0,
      is_active: true,
      created_at: new Date().toISOString(),
    };

    it("lists honorifics and creates a new one", async () => {
      allAllowed();
      mockEmptyLists();
      let honorifics = [BASE_HONORIFIC];
      server.use(
        http.get(`${API_BASE_URL}/honorifics`, () => HttpResponse.json(honorifics)),
        http.post(`${API_BASE_URL}/honorifics`, async ({ request }) => {
          const body = await request.json();
          const created = { ...BASE_HONORIFIC, id: "honorific-2", is_active: true, ...body };
          honorifics = [...honorifics, created];
          return HttpResponse.json(created, { status: 201 });
        }),
      );

      render(<ReferenceLists />);
      await waitForLoaded();

      const card = within(screen.getByRole("region", { name: "Honorifics" }));
      expect(card.getByText("MR")).toBeInTheDocument();

      await userEvent.type(card.getByLabelText(/code/i), "DR");
      await userEvent.type(card.getByLabelText(/label/i), "Dr.");
      await userEvent.click(card.getByRole("button", { name: /add honorific/i }));

      expect(await card.findByText("DR")).toBeInTheDocument();
    });
  });

  describe("NGO Classifications card", () => {
    const CLASSIFICATION = {
      id: "class-1",
      name: "Health & Medical",
      description: null,
      position: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      organisation_count: 0,
    };

    it("lists classifications with NGO counts", async () => {
      allAllowed();
      mockEmptyLists();
      server.use(
        http.get(`${API_BASE_URL}/ngo-classifications`, () =>
          HttpResponse.json([{ ...CLASSIFICATION, organisation_count: 3 }]),
        ),
      );

      render(<ReferenceLists />);
      await waitForLoaded();

      const card = within(screen.getByRole("region", { name: "NGO Classifications" }));
      expect(card.getByText("Health & Medical")).toBeInTheDocument();
      expect(card.getByText("3")).toBeInTheDocument();
    });

    it("warns about affected NGOs before deleting", async () => {
      allAllowed();
      mockEmptyLists();
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      server.use(
        http.get(`${API_BASE_URL}/ngo-classifications`, () =>
          HttpResponse.json([{ ...CLASSIFICATION, organisation_count: 5 }]),
        ),
      );

      render(<ReferenceLists />);
      await waitForLoaded();

      const card = within(screen.getByRole("region", { name: "NGO Classifications" }));
      await userEvent.click(card.getByRole("button", { name: /delete/i }));

      expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("5 NGOs will become unclassified"));
      confirmSpy.mockRestore();
    });
  });

  describe("Dinner Event Types card", () => {
    const TYPE = {
      id: "type-1",
      name: "Regular Meeting",
      color_bg: "#e3edfb",
      color_text: "#17458f",
      sort_order: 0,
      event_count: 2,
      created_at: new Date().toISOString(),
    };

    it("lists event types with a color preview chip", async () => {
      allAllowed();
      mockEmptyLists();
      server.use(http.get(`${API_BASE_URL}/dinner-event-types`, () => HttpResponse.json([TYPE])));

      render(<ReferenceLists />);
      await waitForLoaded();

      const card = within(screen.getByRole("region", { name: "Dinner Event Types" }));
      expect(card.getByText("Regular Meeting")).toBeInTheDocument();
      expect(card.getByText("2")).toBeInTheDocument();
    });

    it("blocks deletion when the type is still used by events", async () => {
      allAllowed();
      mockEmptyLists();
      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
      server.use(http.get(`${API_BASE_URL}/dinner-event-types`, () => HttpResponse.json([TYPE])));

      render(<ReferenceLists />);
      await waitForLoaded();

      const card = within(screen.getByRole("region", { name: "Dinner Event Types" }));
      await userEvent.click(card.getByRole("button", { name: /delete/i }));

      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("cannot be deleted"));
      alertSpy.mockRestore();
    });

    it("creates a new event type with a color preview", async () => {
      allAllowed();
      mockEmptyLists();
      let types = [];
      server.use(
        http.get(`${API_BASE_URL}/dinner-event-types`, () => HttpResponse.json(types)),
        http.post(`${API_BASE_URL}/dinner-event-types`, async ({ request }) => {
          const body = await request.json();
          const created = { ...TYPE, id: "type-2", event_count: 0, ...body };
          types = [created];
          return HttpResponse.json(created, { status: 201 });
        }),
      );

      render(<ReferenceLists />);
      await waitForLoaded();

      const card = within(screen.getByRole("region", { name: "Dinner Event Types" }));
      await userEvent.type(card.getByLabelText(/^name$/i), "Gala");
      await userEvent.click(card.getByRole("button", { name: /add event type/i }));

      expect(await card.findByText("Gala")).toBeInTheDocument();
    });

    it("reorders event types via the up/down buttons", async () => {
      allAllowed();
      mockEmptyLists();
      const second = { ...TYPE, id: "type-2", name: "Gala", color_bg: null, color_text: null };
      let types = [TYPE, second];
      server.use(
        http.get(`${API_BASE_URL}/dinner-event-types`, () => HttpResponse.json(types)),
        http.patch(`${API_BASE_URL}/dinner-event-types/reorder`, async ({ request }) => {
          const body = await request.json();
          types = body.items.map((item) => types.find((t) => t.id === item.id));
          return HttpResponse.json({ ok: true });
        }),
      );

      render(<ReferenceLists />);
      await waitForLoaded();

      const card = within(screen.getByRole("region", { name: "Dinner Event Types" }));
      await userEvent.click(card.getByRole("button", { name: /move gala up/i }));

      await waitFor(() => expect(types[0].id).toBe("type-2"));
    });
  });

  it("hides a card entirely when the user lacks read access to that list", async () => {
    permissionsByKey = {
      "admin.member_titles": { canRead: false, canWrite: false },
      "admin.honorifics": { canRead: true, canWrite: true },
      "admin.ngo_classifications": { canRead: true, canWrite: true },
      "admin.dinner_event_types": { canRead: true, canWrite: true },
    };
    mockEmptyLists();

    render(<ReferenceLists />);
    await waitForLoaded();

    expect(screen.queryByRole("region", { name: "Member Titles" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Honorifics" })).toBeInTheDocument();
  });
});
