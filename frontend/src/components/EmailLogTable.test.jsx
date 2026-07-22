import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import EmailLogTable from "./EmailLogTable";

const ENTRY = {
  id: "log-1",
  subject: "A very long subject line that should truncate instead of wrapping onto a second line",
  recipient_group: "all",
  recipient_count: 12,
  status: "sent",
  has_attachments: true,
  sent_at: new Date("2026-01-15T10:00:00Z").toISOString(),
};

describe("EmailLogTable (Story 16.24)", () => {
  it("renders the log entry on one row with a full-width, non-capped table", () => {
    const { container } = render(<EmailLogTable entries={[ENTRY]} />);

    const cardWrapper = container.querySelector(".w-full");
    expect(cardWrapper).toBeInTheDocument();
    expect(container.innerHTML).not.toContain("max-w-[900px]");

    const subjectCell = screen.getByTitle(ENTRY.subject);
    expect(subjectCell).toHaveTextContent(ENTRY.subject);
    expect(subjectCell.className).toMatch(/truncate/);

    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Sent")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
  });

  it("keeps every non-subject column on a single line via whitespace-nowrap", () => {
    render(<EmailLogTable entries={[ENTRY]} />);

    const recipientCountCell = screen.getByText("12");
    expect(recipientCountCell.className).toMatch(/whitespace-nowrap/);

    const sentAtCell = screen.getByText(new Date(ENTRY.sent_at).toLocaleString());
    expect(sentAtCell.className).toMatch(/whitespace-nowrap/);
  });

  it("shows an empty state when nothing has been sent yet", () => {
    render(<EmailLogTable entries={[]} />);

    expect(screen.getByText(/no emails sent yet/i)).toBeInTheDocument();
  });

  it("gives every non-subject column an explicit fixed width via colgroup, so columns can't overlap under table-fixed", () => {
    const { container } = render(<EmailLogTable entries={[ENTRY]} />);

    const cols = container.querySelectorAll("colgroup col");
    expect(cols).toHaveLength(6);
    // Subject (first column) is the only one with no fixed width — it gets
    // whatever space the other 5 fixed-width columns leave behind.
    expect(cols[0].style.width).toBe("");
    for (const col of Array.from(cols).slice(1)) {
      expect(col.style.width).not.toBe("");
    }
  });
});
