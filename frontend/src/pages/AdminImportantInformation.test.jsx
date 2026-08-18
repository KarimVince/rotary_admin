import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import AdminImportantInformation from "./AdminImportantInformation";

const API_BASE_URL = "http://localhost:8000/api/v1";

let mockCanRead = true;
let mockCanWrite = true;
vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: mockCanRead, canWrite: mockCanWrite }),
}));

const ACTIVE_MESSAGE = {
  id: "info-active",
  title: "AGM this Saturday",
  text: "Don't forget the AGM at 10am.",
  status: "active",
  created_by: "user-1",
  created_by_name: "Jane Secretary",
  created_at: new Date().toISOString(),
  archived_at: null,
};

const ARCHIVED_MESSAGE = {
  id: "info-archived",
  title: "Old announcement",
  text: "This is old news.",
  status: "archived",
  created_by: "user-1",
  created_by_name: "Jane Secretary",
  created_at: new Date().toISOString(),
  archived_at: new Date().toISOString(),
};

function renderPage() {
  return render(<AdminImportantInformation />);
}

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
}

describe("AdminImportantInformation", () => {
  it("shows a permission-denied message when the user has no access", () => {
    mockCanRead = false;
    mockCanWrite = false;
    renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent(/do not have permission/i);
  });

  it("shows the active message and history", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    server.use(
      http.get(`${API_BASE_URL}/important-information`, () =>
        HttpResponse.json([ACTIVE_MESSAGE, ARCHIVED_MESSAGE]),
      ),
    );
    renderPage();
    await waitForLoaded();

    expect(screen.getByText("AGM this Saturday")).toBeInTheDocument();
    expect(screen.getByText("Old announcement")).toBeInTheDocument();
  });

  it("shows 'No active message' when nothing is active", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    server.use(http.get(`${API_BASE_URL}/important-information`, () => HttpResponse.json([])));
    renderPage();
    await waitForLoaded();

    expect(screen.getByText(/no active message/i)).toBeInTheDocument();
    expect(screen.getByText(/no archived messages yet/i)).toBeInTheDocument();
  });

  it("read-only users see content but no form or action buttons", async () => {
    mockCanRead = true;
    mockCanWrite = false;
    server.use(
      http.get(`${API_BASE_URL}/important-information`, () =>
        HttpResponse.json([ACTIVE_MESSAGE, ARCHIVED_MESSAGE]),
      ),
    );
    renderPage();
    await waitForLoaded();

    expect(screen.queryByLabelText(/^title$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reactivate/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
  });

  it("a write user can create a new message, archiving the previous active one", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    let created = false;
    let capturedBody;
    server.use(
      http.get(`${API_BASE_URL}/important-information`, () =>
        HttpResponse.json(created ? [{ ...ACTIVE_MESSAGE, status: "archived" }] : []),
      ),
      http.post(`${API_BASE_URL}/important-information`, async ({ request }) => {
        capturedBody = await request.json();
        created = true;
        return HttpResponse.json(ACTIVE_MESSAGE, { status: 201 });
      }),
    );
    renderPage();
    await waitForLoaded();

    await userEvent.type(screen.getByLabelText(/^title$/i), "New title");
    await userEvent.type(screen.getByLabelText(/^text$/i), "New body text");
    await userEvent.click(screen.getByRole("button", { name: /save & activate/i }));

    await waitFor(() => expect(capturedBody).toEqual({ title: "New title", text: "New body text" }));
  });

  it("a write user can reactivate an archived message", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    let reactivated = false;
    server.use(
      http.get(`${API_BASE_URL}/important-information`, () =>
        HttpResponse.json(
          reactivated
            ? [{ ...ARCHIVED_MESSAGE, status: "active", archived_at: null }]
            : [ARCHIVED_MESSAGE],
        ),
      ),
      http.post(`${API_BASE_URL}/important-information/${ARCHIVED_MESSAGE.id}/reactivate`, () => {
        reactivated = true;
        return HttpResponse.json({ ...ARCHIVED_MESSAGE, status: "active", archived_at: null });
      }),
    );
    renderPage();
    await waitForLoaded();

    await userEvent.click(screen.getByRole("button", { name: /reactivate/i }));

    await waitFor(() => expect(screen.getByText(/set by/i)).toBeInTheDocument());
  });

  it("a write user can manually deactivate the active message", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    let deactivated = false;
    vi.spyOn(window, "confirm").mockReturnValue(true);
    server.use(
      http.get(`${API_BASE_URL}/important-information`, () =>
        HttpResponse.json(deactivated ? [{ ...ACTIVE_MESSAGE, status: "archived" }] : [ACTIVE_MESSAGE]),
      ),
      http.post(`${API_BASE_URL}/important-information/${ACTIVE_MESSAGE.id}/deactivate`, () => {
        deactivated = true;
        return HttpResponse.json({ ...ACTIVE_MESSAGE, status: "archived" });
      }),
    );
    renderPage();
    await waitForLoaded();

    expect(screen.getByText("AGM this Saturday")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /deactivate/i }));

    await waitFor(() => expect(screen.getByText(/no active message/i)).toBeInTheDocument());
  });

  it("read-only users don't see a Deactivate button", async () => {
    mockCanRead = true;
    mockCanWrite = false;
    server.use(
      http.get(`${API_BASE_URL}/important-information`, () => HttpResponse.json([ACTIVE_MESSAGE])),
    );
    renderPage();
    await waitForLoaded();

    expect(screen.getByText("AGM this Saturday")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /deactivate/i })).not.toBeInTheDocument();
  });

  it("a write user can delete an archived message", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    let deleted = false;
    vi.spyOn(window, "confirm").mockReturnValue(true);
    server.use(
      http.get(`${API_BASE_URL}/important-information`, () =>
        HttpResponse.json(deleted ? [] : [ARCHIVED_MESSAGE]),
      ),
      http.delete(`${API_BASE_URL}/important-information/${ARCHIVED_MESSAGE.id}`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderPage();
    await waitForLoaded();

    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(screen.getByText(/no archived messages yet/i)).toBeInTheDocument());
  });
});
