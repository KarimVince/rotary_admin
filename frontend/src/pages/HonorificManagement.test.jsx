import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import HonorificManagement from "./HonorificManagement";

vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: true, canWrite: true }),
}));

const API_BASE_URL = "http://localhost:8000/api/v1";

const BASE_HONORIFIC = {
  id: "honorific-1",
  code: "MR",
  label: "Mr.",
  sort_order: 0,
  is_active: true,
  created_at: new Date().toISOString(),
};

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
}

describe("HonorificManagement", () => {
  it("lists honorifics fetched from the API", async () => {
    server.use(http.get(`${API_BASE_URL}/honorifics`, () => HttpResponse.json([BASE_HONORIFIC])));

    render(<HonorificManagement />);

    expect(await screen.findByText("MR")).toBeInTheDocument();
    expect(screen.getByText("Mr.")).toBeInTheDocument();
  });

  it("creates a honorific and refreshes the list", async () => {
    let honorifics = [];
    server.use(
      http.get(`${API_BASE_URL}/honorifics`, () => HttpResponse.json(honorifics)),
      http.post(`${API_BASE_URL}/honorifics`, async ({ request }) => {
        const body = await request.json();
        const created = { ...BASE_HONORIFIC, id: "honorific-2", is_active: true, ...body };
        honorifics = [created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    render(<HonorificManagement />);
    await waitForLoaded();

    await userEvent.type(screen.getByLabelText(/code/i), "DR");
    await userEvent.type(screen.getByLabelText(/label/i), "Dr.");
    await userEvent.click(screen.getByRole("button", { name: /add honorific/i }));

    expect(await screen.findByText("DR")).toBeInTheDocument();
    expect(screen.getByText("Dr.")).toBeInTheDocument();
  });

  it("shows an error when creation fails", async () => {
    server.use(
      http.get(`${API_BASE_URL}/honorifics`, () => HttpResponse.json([])),
      http.post(`${API_BASE_URL}/honorifics`, () =>
        HttpResponse.json({ detail: "Honorific code already exists" }, { status: 409 }),
      ),
    );

    render(<HonorificManagement />);
    await waitForLoaded();

    await userEvent.type(screen.getByLabelText(/code/i), "MR");
    await userEvent.type(screen.getByLabelText(/label/i), "Mr.");
    await userEvent.click(screen.getByRole("button", { name: /add honorific/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/honorific code already exists/i);
  });

  it("edits a honorific via the same form", async () => {
    let honorific = { ...BASE_HONORIFIC };
    server.use(
      http.get(`${API_BASE_URL}/honorifics`, () => HttpResponse.json([honorific])),
      http.patch(`${API_BASE_URL}/honorifics/${BASE_HONORIFIC.id}`, async ({ request }) => {
        honorific = { ...honorific, ...(await request.json()) };
        return HttpResponse.json(honorific);
      }),
    );

    render(<HonorificManagement />);
    await screen.findByText("MR");

    await userEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    expect(screen.getByRole("heading", { name: /edit honorific/i })).toBeInTheDocument();

    const labelInput = screen.getByLabelText(/label/i);
    await userEvent.clear(labelInput);
    await userEvent.type(labelInput, "Mister");
    await userEvent.click(screen.getByRole("button", { name: /update honorific/i }));

    expect(await screen.findByText("Mister")).toBeInTheDocument();
  });

  it("toggles a honorific's active status", async () => {
    let honorific = { ...BASE_HONORIFIC };
    server.use(
      http.get(`${API_BASE_URL}/honorifics`, () => HttpResponse.json([honorific])),
      http.delete(`${API_BASE_URL}/honorifics/${BASE_HONORIFIC.id}`, () => {
        honorific = { ...honorific, is_active: false };
        return HttpResponse.json(honorific);
      }),
    );

    render(<HonorificManagement />);
    await screen.findByText("MR");
    expect(screen.getByText("Active")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /deactivate/i }));

    expect(await screen.findByText("Inactive")).toBeInTheDocument();
  });
});
