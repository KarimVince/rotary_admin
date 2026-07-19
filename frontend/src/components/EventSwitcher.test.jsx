import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import EventSwitcher from "./EventSwitcher";

const EVENTS = [
  { id: "event-1", name: "Annual Ball", date: "2026-08-15" },
  { id: "event-2", name: "Fellowship Night", date: "2026-09-01" },
];

describe("EventSwitcher", () => {
  it("shows a placeholder when there are no events", () => {
    render(<EventSwitcher events={[]} selectedEvent={null} onSelect={vi.fn()} />);
    expect(screen.getByText(/create one on the Event List page/i)).toBeInTheDocument();
  });

  it("renders a pill per event and marks the selected one active", () => {
    render(<EventSwitcher events={EVENTS} selectedEvent={EVENTS[0]} onSelect={vi.fn()} />);

    const activePill = screen.getByRole("tab", { name: /Annual Ball/i });
    const inactivePill = screen.getByRole("tab", { name: /Fellowship Night/i });
    expect(activePill).toHaveAttribute("aria-selected", "true");
    expect(inactivePill).toHaveAttribute("aria-selected", "false");
  });

  it("calls onSelect when clicking a different pill", async () => {
    const onSelect = vi.fn();
    render(<EventSwitcher events={EVENTS} selectedEvent={EVENTS[0]} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole("tab", { name: /Fellowship Night/i }));

    expect(onSelect).toHaveBeenCalledWith("event-2");
  });
});
