import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import MemberTitleManagement from "./MemberTitleManagement";

vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: true, canWrite: true }),
}));

const API_BASE_URL = "http://localhost:8000/api/v1";

const BASE_TITLE = {
  id: "title-1",
  code: "Rtn",
  label: "Rotarian",
  sort_order: 0,
  is_active: true,
  created_at: new Date().toISOString(),
};

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
}

describe("MemberTitleManagement", () => {
  it("lists titles fetched from the API", async () => {
    server.use(http.get(`${API_BASE_URL}/member-titles`, () => HttpResponse.json([BASE_TITLE])));

    render(<MemberTitleManagement />);

    expect(await screen.findByText("Rtn")).toBeInTheDocument();
    expect(screen.getByText("Rotarian")).toBeInTheDocument();
  });

  it("creates a title and refreshes the list", async () => {
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

    render(<MemberTitleManagement />);
    await waitForLoaded();

    await userEvent.type(screen.getByLabelText(/code/i), "PP");
    await userEvent.type(screen.getByLabelText(/label/i), "Past President");
    await userEvent.click(screen.getByRole("button", { name: /add title/i }));

    expect(await screen.findByText("PP")).toBeInTheDocument();
    expect(screen.getByText("Past President")).toBeInTheDocument();
  });

  it("shows an error when creation fails", async () => {
    server.use(
      http.get(`${API_BASE_URL}/member-titles`, () => HttpResponse.json([])),
      http.post(`${API_BASE_URL}/member-titles`, () =>
        HttpResponse.json({ detail: "Title code already exists" }, { status: 409 }),
      ),
    );

    render(<MemberTitleManagement />);
    await waitForLoaded();

    await userEvent.type(screen.getByLabelText(/code/i), "Rtn");
    await userEvent.type(screen.getByLabelText(/label/i), "Rotarian");
    await userEvent.click(screen.getByRole("button", { name: /add title/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/title code already exists/i);
  });

  it("edits a title via the same form", async () => {
    let title = { ...BASE_TITLE };
    server.use(
      http.get(`${API_BASE_URL}/member-titles`, () => HttpResponse.json([title])),
      http.patch(`${API_BASE_URL}/member-titles/${BASE_TITLE.id}`, async ({ request }) => {
        title = { ...title, ...(await request.json()) };
        return HttpResponse.json(title);
      }),
    );

    render(<MemberTitleManagement />);
    await screen.findByText("Rtn");

    await userEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    expect(screen.getByRole("heading", { name: /edit title/i })).toBeInTheDocument();

    const labelInput = screen.getByLabelText(/label/i);
    await userEvent.clear(labelInput);
    await userEvent.type(labelInput, "Rotarian Member");
    await userEvent.click(screen.getByRole("button", { name: /update title/i }));

    expect(await screen.findByText("Rotarian Member")).toBeInTheDocument();
  });

  it("toggles a title's active status", async () => {
    let title = { ...BASE_TITLE };
    server.use(
      http.get(`${API_BASE_URL}/member-titles`, () => HttpResponse.json([title])),
      http.delete(`${API_BASE_URL}/member-titles/${BASE_TITLE.id}`, () => {
        title = { ...title, is_active: false };
        return HttpResponse.json(title);
      }),
    );

    render(<MemberTitleManagement />);
    await screen.findByText("Rtn");
    expect(screen.getByText("Active")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /deactivate/i }));

    expect(await screen.findByText("Inactive")).toBeInTheDocument();
  });
});
