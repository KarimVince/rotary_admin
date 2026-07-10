import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import NgoClassificationManagement from "./NgoClassificationManagement";

const API_BASE_URL = "http://localhost:8000/api/v1";

let mockCanRead = true;
let mockCanWrite = true;
vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: mockCanRead, canWrite: mockCanWrite }),
}));

const CLASSIFICATION = {
  id: "class-1",
  name: "Health & Medical",
  description: null,
  position: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  organisation_count: 0,
};

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
}

describe("NgoClassificationManagement", () => {
  it("lists classifications with NGO counts", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    server.use(
      http.get(`${API_BASE_URL}/ngo-classifications`, () =>
        HttpResponse.json([{ ...CLASSIFICATION, organisation_count: 3 }]),
      ),
    );

    render(<NgoClassificationManagement />);
    await waitForLoaded();

    expect(screen.getByText("Health & Medical")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("creates a classification and refreshes the list", async () => {
    let classifications = [];
    server.use(
      http.get(`${API_BASE_URL}/ngo-classifications`, () => HttpResponse.json(classifications)),
      http.post(`${API_BASE_URL}/ngo-classifications`, async ({ request }) => {
        const body = await request.json();
        const created = { ...CLASSIFICATION, id: "class-2", ...body };
        classifications = [created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    render(<NgoClassificationManagement />);
    await waitForLoaded();

    await userEvent.type(screen.getByLabelText(/name/i), "Youth Development");
    await userEvent.click(screen.getByRole("button", { name: /add classification/i }));

    expect(await screen.findByText("Youth Development")).toBeInTheDocument();
  });

  it("warns about affected NGOs before deleting", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    server.use(
      http.get(`${API_BASE_URL}/ngo-classifications`, () =>
        HttpResponse.json([{ ...CLASSIFICATION, organisation_count: 5 }]),
      ),
    );

    render(<NgoClassificationManagement />);
    await waitForLoaded();

    await userEvent.click(screen.getByRole("button", { name: /delete/i }));

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining("5 NGOs will become unclassified"),
    );
    confirmSpy.mockRestore();
  });

  it("hides write controls for a read-only user", async () => {
    mockCanRead = true;
    mockCanWrite = false;
    server.use(
      http.get(`${API_BASE_URL}/ngo-classifications`, () => HttpResponse.json([CLASSIFICATION])),
    );

    render(<NgoClassificationManagement />);
    await waitForLoaded();

    expect(screen.queryByRole("button", { name: /add classification/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });

  it("denies access for a user without read permission", async () => {
    mockCanRead = false;
    mockCanWrite = false;
    render(<NgoClassificationManagement />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/do not have permission/i);
  });
});
