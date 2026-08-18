import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import { ThemeProvider } from "../context/ThemeContext";
import EventMinutesSection from "./EventMinutesSection";

const API_BASE_URL = "http://localhost:8000/api/v1";
const EVENT_ID = "event-1";

let mockCanRead = true;
let mockCanWrite = true;
vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: mockCanRead, canWrite: mockCanWrite }),
}));

const TEXT_MINUTES = {
  id: "minutes-1",
  event_id: EVENT_ID,
  minutes_type: "text",
  content_text: "Meeting opened at 7pm.",
  file_original_filename: null,
  file_content_type: null,
  file_size_bytes: null,
  created_by: "user-1",
  created_by_name: "Jane Secretary",
  created_at: new Date().toISOString(),
  last_updated_by: "user-1",
  last_updated_by_name: "Jane Secretary",
  last_updated_at: new Date().toISOString(),
};

const FILE_MINUTES = {
  ...TEXT_MINUTES,
  id: "minutes-2",
  minutes_type: "file",
  content_text: null,
  file_original_filename: "Minutes.pdf",
  file_content_type: "application/pdf",
  file_size_bytes: 1024,
};

function renderSection() {
  return render(
    <ThemeProvider>
      <EventMinutesSection eventId={EVENT_ID} />
    </ThemeProvider>,
  );
}

describe("EventMinutesSection", () => {
  it("renders nothing when the user has no access", async () => {
    mockCanRead = false;
    mockCanWrite = false;
    const { container } = renderSection();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the empty state when no minutes exist", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    server.use(
      http.get(`${API_BASE_URL}/attendance/events/${EVENT_ID}/minutes`, () => HttpResponse.json([])),
    );
    renderSection();
    await waitFor(() => expect(screen.getByText(/no minutes recorded yet/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /add minutes/i })).toBeInTheDocument();
  });

  it("renders existing text and file minutes", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    server.use(
      http.get(`${API_BASE_URL}/attendance/events/${EVENT_ID}/minutes`, () =>
        HttpResponse.json([TEXT_MINUTES, FILE_MINUTES]),
      ),
    );
    renderSection();
    await waitFor(() => expect(screen.getByText(/meeting opened at 7pm/i)).toBeInTheDocument());
    expect(screen.getByText("Minutes.pdf")).toBeInTheDocument();
    expect(screen.getAllByText(/last edited by jane secretary/i)).toHaveLength(2);
  });

  it("read-only users see minutes but no edit/delete controls", async () => {
    mockCanRead = true;
    mockCanWrite = false;
    server.use(
      http.get(`${API_BASE_URL}/attendance/events/${EVENT_ID}/minutes`, () =>
        HttpResponse.json([TEXT_MINUTES]),
      ),
    );
    renderSection();
    await waitFor(() => expect(screen.getByText(/meeting opened at 7pm/i)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /add minutes/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit minutes/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete minutes/i })).not.toBeInTheDocument();
  });

  it("a write user can add text minutes", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    let created = false;
    server.use(
      http.get(`${API_BASE_URL}/attendance/events/${EVENT_ID}/minutes`, () =>
        HttpResponse.json(created ? [TEXT_MINUTES] : []),
      ),
      http.post(`${API_BASE_URL}/attendance/events/${EVENT_ID}/minutes/text`, async ({ request }) => {
        const body = await request.json();
        expect(body.content_text).toBe("New minutes content");
        created = true;
        return HttpResponse.json(TEXT_MINUTES, { status: 201 });
      }),
    );
    renderSection();
    await waitFor(() => expect(screen.getByText(/no minutes recorded yet/i)).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /add minutes/i }));
    await userEvent.type(screen.getByPlaceholderText(/paste or type the minutes/i), "New minutes content");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(screen.getByText(/meeting opened at 7pm/i)).toBeInTheDocument());
  });

  it("a write user can delete minutes", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    let deleted = false;
    vi.spyOn(window, "confirm").mockReturnValue(true);
    server.use(
      http.get(`${API_BASE_URL}/attendance/events/${EVENT_ID}/minutes`, () =>
        HttpResponse.json(deleted ? [] : [TEXT_MINUTES]),
      ),
      http.delete(`${API_BASE_URL}/attendance/events/${EVENT_ID}/minutes/${TEXT_MINUTES.id}`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderSection();
    await waitFor(() => expect(screen.getByText(/meeting opened at 7pm/i)).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /delete minutes/i }));

    await waitFor(() => expect(screen.getByText(/no minutes recorded yet/i)).toBeInTheDocument());
  });
});
