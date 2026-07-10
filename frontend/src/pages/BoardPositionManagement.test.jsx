import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import BoardPositionManagement from "./BoardPositionManagement";

vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: true, canWrite: true }),
}));

const API_BASE_URL = "http://localhost:8000/api/v1";

const BASE_POSITION = {
  id: "position-1",
  name: "President",
  description: "Club president",
  display_order: 0,
  active: true,
  created_at: new Date().toISOString(),
};

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
}

describe("BoardPositionManagement", () => {
  it("lists board positions fetched from the API", async () => {
    server.use(
      http.get(`${API_BASE_URL}/board/positions`, () => HttpResponse.json([BASE_POSITION])),
    );

    render(<BoardPositionManagement />);

    expect(await screen.findByText("President")).toBeInTheDocument();
  });

  it("creates a board position and refreshes the list", async () => {
    let positions = [];
    server.use(
      http.get(`${API_BASE_URL}/board/positions`, () => HttpResponse.json(positions)),
      http.post(`${API_BASE_URL}/board/positions`, async ({ request }) => {
        const body = await request.json();
        const created = { ...BASE_POSITION, id: "position-2", active: true, ...body };
        positions = [created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    render(<BoardPositionManagement />);
    await waitForLoaded();

    await userEvent.type(screen.getByLabelText(/name/i), "Secretary");
    await userEvent.click(screen.getByRole("button", { name: /add position/i }));

    expect(await screen.findByText("Secretary")).toBeInTheDocument();
  });

  it("shows an error when creation fails", async () => {
    server.use(
      http.get(`${API_BASE_URL}/board/positions`, () => HttpResponse.json([])),
      http.post(`${API_BASE_URL}/board/positions`, () =>
        HttpResponse.json({ detail: "Position name already exists" }, { status: 409 }),
      ),
    );

    render(<BoardPositionManagement />);
    await waitForLoaded();

    await userEvent.type(screen.getByLabelText(/name/i), "President");
    await userEvent.click(screen.getByRole("button", { name: /add position/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/position name already exists/i);
  });

  it("edits a board position via the same form", async () => {
    let position = { ...BASE_POSITION };
    server.use(
      http.get(`${API_BASE_URL}/board/positions`, () => HttpResponse.json([position])),
      http.patch(`${API_BASE_URL}/board/positions/${BASE_POSITION.id}`, async ({ request }) => {
        position = { ...position, ...(await request.json()) };
        return HttpResponse.json(position);
      }),
    );

    render(<BoardPositionManagement />);
    await screen.findByText("President");

    await userEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    expect(screen.getByRole("heading", { name: /edit position/i })).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/name/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Club President");
    await userEvent.click(screen.getByRole("button", { name: /update position/i }));

    expect(await screen.findByText("Club President")).toBeInTheDocument();
  });

  it("toggles a board position's active status", async () => {
    let position = { ...BASE_POSITION };
    server.use(
      http.get(`${API_BASE_URL}/board/positions`, () => HttpResponse.json([position])),
      http.delete(`${API_BASE_URL}/board/positions/${BASE_POSITION.id}`, () => {
        position = { ...position, active: false };
        return HttpResponse.json(position);
      }),
    );

    render(<BoardPositionManagement />);
    await screen.findByText("President");
    expect(screen.getByText("Active")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /deactivate/i }));

    expect(await screen.findByText("Inactive")).toBeInTheDocument();
  });
});
