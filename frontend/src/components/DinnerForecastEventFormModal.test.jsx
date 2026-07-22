import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import DinnerForecastEventFormModal from "./DinnerForecastEventFormModal";

const API_BASE_URL = "http://localhost:8000/api/v1";

const EVENT_TYPES = [{ id: "type-1", name: "Dinner" }];

describe("DinnerForecastEventFormModal (Story 16.27)", () => {
  it("submits start_time/end_time as null when left blank", async () => {
    let capturedBody;
    server.use(
      http.post(`${API_BASE_URL}/dinner-forecast/events`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ id: "event-new" }, { status: 201 });
      }),
    );
    const onSaved = vi.fn();

    render(
      <DinnerForecastEventFormModal
        event={null}
        members={[]}
        eventTypes={EVENT_TYPES}
        onClose={() => {}}
        onSaved={onSaved}
      />,
    );

    await userEvent.type(screen.getByLabelText("Event name"), "Welcome Dinner");
    await userEvent.type(screen.getByLabelText("Date"), "2026-08-01");
    await userEvent.type(screen.getByLabelText("Location"), "Club House");
    await userEvent.click(screen.getByRole("button", { name: /create event/i }));

    await waitFor(() => expect(capturedBody).toBeDefined());
    expect(capturedBody.start_time).toBeNull();
    expect(capturedBody.end_time).toBeNull();
  });

  it("submits the entered start_time/end_time", async () => {
    let capturedBody;
    server.use(
      http.post(`${API_BASE_URL}/dinner-forecast/events`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ id: "event-new" }, { status: 201 });
      }),
    );

    render(
      <DinnerForecastEventFormModal
        event={null}
        members={[]}
        eventTypes={EVENT_TYPES}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    await userEvent.type(screen.getByLabelText("Event name"), "Welcome Dinner");
    await userEvent.type(screen.getByLabelText("Date"), "2026-08-01");
    await userEvent.type(screen.getByLabelText("Location"), "Club House");
    await userEvent.type(screen.getByLabelText("Start Time"), "19:00");
    await userEvent.type(screen.getByLabelText("End Time"), "21:30");
    await userEvent.click(screen.getByRole("button", { name: /create event/i }));

    await waitFor(() => expect(capturedBody).toBeDefined());
    expect(capturedBody.start_time).toBe("19:00");
    expect(capturedBody.end_time).toBe("21:30");
  });

  it("pre-fills start_time/end_time (truncated to HH:MM) when editing an existing event", () => {
    render(
      <DinnerForecastEventFormModal
        event={{
          id: "event-1",
          name: "Welcome Dinner",
          event_date: "2026-08-01",
          event_type: "Dinner",
          location: "Club House",
          start_time: "19:00:00",
          end_time: "21:30:00",
        }}
        members={[]}
        eventTypes={EVENT_TYPES}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    expect(screen.getByLabelText("Start Time")).toHaveValue("19:00");
    expect(screen.getByLabelText("End Time")).toHaveValue("21:30");
  });
});
