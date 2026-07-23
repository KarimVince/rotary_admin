import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import { currentRotaryYear } from "../utils/rotaryYear";
import BoardMembers from "./BoardMembers";

const API_BASE_URL = "http://localhost:8000/api/v1";
const CURRENT_YEAR = currentRotaryYear();

let mockAccess = { canRead: true, canWrite: false };
vi.mock("../hooks/useAccess", () => ({
  useAccess: () => mockAccess,
}));

const PRESIDENT = {
  id: "position-1",
  name: "President",
  description: "",
  display_order: 0,
  active: true,
  at_the_board: true,
  created_at: new Date().toISOString(),
};

const SECRETARY = {
  id: "position-2",
  name: "Secretary",
  description: "",
  display_order: 1,
  active: true,
  at_the_board: true,
  created_at: new Date().toISOString(),
};

const SPEAKER_COORDINATOR = {
  id: "position-3",
  name: "Speaker Coordinator",
  description: "",
  display_order: 2,
  active: true,
  at_the_board: false,
  created_at: new Date().toISOString(),
};

const JANE = { id: "member-1", first_name: "Jane", last_name: "Doe" };
const JOHN = { id: "member-2", first_name: "John", last_name: "Smith" };

function assignment(overrides = {}) {
  return {
    id: "assignment-1",
    board_position_id: PRESIDENT.id,
    member_id: JANE.id,
    rotary_year: CURRENT_YEAR,
    start_date: "2026-07-01",
    end_date: null,
    created_by: null,
    created_at: new Date().toISOString(),
    board_position: PRESIDENT,
    member: JANE,
    ...overrides,
  };
}

function rotaryYearRow(year, isCurrent = false) {
  return {
    id: `year-${year}`,
    year,
    label: `${year}–${year + 1}`,
    start_date: `${year}-07-01`,
    end_date: `${year + 1}-06-30`,
    is_current: isCurrent,
    created_at: new Date().toISOString(),
  };
}

const ROTARY_YEARS = [
  rotaryYearRow(CURRENT_YEAR, true),
  rotaryYearRow(CURRENT_YEAR - 1),
  rotaryYearRow(CURRENT_YEAR - 2),
];

function mockBaseData({ positions = [PRESIDENT, SECRETARY], assignments = [] } = {}) {
  server.use(
    http.get(`${API_BASE_URL}/rotary-years`, () => HttpResponse.json(ROTARY_YEARS)),
    http.get(`${API_BASE_URL}/board/positions`, () => HttpResponse.json(positions)),
    http.get(`${API_BASE_URL}/board/assignments`, () => HttpResponse.json(assignments)),
    http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([JANE, JOHN])),
  );
}

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
}

describe("BoardMembers", () => {
  it("shows a permission-denied message without read access", () => {
    mockAccess = { canRead: false, canWrite: false };
    mockBaseData();

    render(<BoardMembers />);

    expect(screen.getByRole("alert")).toHaveTextContent(/do not have permission/i);
  });

  it("renders positions with vacant state and no action column when read-only", async () => {
    mockAccess = { canRead: true, canWrite: false };
    mockBaseData({ assignments: [assignment()] });

    render(<BoardMembers />);
    await waitForLoaded();

    expect(screen.getByText("President")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Secretary")).toBeInTheDocument();
    expect(screen.getByText("— Vacant —")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /assign/i })).not.toBeInTheDocument();
  });

  it("shows Assign/Change actions for the current term with manage access", async () => {
    mockAccess = { canRead: true, canWrite: true };
    mockBaseData({ assignments: [assignment()] });

    render(<BoardMembers />);
    await waitForLoaded();

    expect(screen.getByRole("button", { name: /^change$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^assign$/i })).toBeInTheDocument();
  });

  it("assigns a member to a vacant position", async () => {
    mockAccess = { canRead: true, canWrite: true };
    let assignments = [];
    server.use(
      http.get(`${API_BASE_URL}/board/positions`, () => HttpResponse.json([PRESIDENT])),
      http.get(`${API_BASE_URL}/board/assignments`, () => HttpResponse.json(assignments)),
      http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([JANE, JOHN])),
      http.post(`${API_BASE_URL}/board/assignments`, async ({ request }) => {
        const body = await request.json();
        const created = assignment({ member_id: body.member_id, member: JANE });
        assignments = [created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    render(<BoardMembers />);
    await waitForLoaded();

    await userEvent.click(screen.getByRole("button", { name: /^assign$/i }));
    await userEvent.type(screen.getByLabelText(/member/i), "Jane");
    await userEvent.click(await screen.findByRole("button", { name: /jane doe/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm assignment/i }));

    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
  });

  it("shows a non-blocking warning when the member already holds another position", async () => {
    mockAccess = { canRead: true, canWrite: true };
    mockBaseData({
      positions: [PRESIDENT, SECRETARY],
      assignments: [assignment({ board_position_id: SECRETARY.id, board_position: SECRETARY })],
    });

    render(<BoardMembers />);
    await waitForLoaded();

    await userEvent.click(screen.getByRole("button", { name: /^assign$/i }));
    await userEvent.type(screen.getByLabelText(/member/i), "Jane");
    await userEvent.click(await screen.findByRole("button", { name: /jane doe/i }));

    expect(await screen.findByText(/already holds secretary/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm assignment/i })).toBeEnabled();
  });

  it("treats a past term as read-only even with manage access", async () => {
    mockAccess = { canRead: true, canWrite: true };
    mockBaseData({ assignments: [] });

    render(<BoardMembers />);
    await waitForLoaded();

    await userEvent.selectOptions(screen.getByLabelText(/term/i), String(CURRENT_YEAR - 1));

    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /assign/i })).not.toBeInTheDocument();
  });

  it("splits positions into Board Members and Non-Board Members sections", async () => {
    mockAccess = { canRead: true, canWrite: false };
    mockBaseData({ positions: [PRESIDENT, SECRETARY, SPEAKER_COORDINATOR], assignments: [] });

    render(<BoardMembers />);
    await waitForLoaded();

    const boardHeading = screen.getByRole("heading", { level: 2, name: "Board Members" });
    const nonBoardHeading = screen.getByRole("heading", { level: 2, name: "Non-Board Members" });
    expect(boardHeading.compareDocumentPosition(nonBoardHeading))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    const boardSection = boardHeading.nextElementSibling;
    const nonBoardSection = nonBoardHeading.nextElementSibling;
    expect(boardSection).toHaveTextContent("President");
    expect(boardSection).toHaveTextContent("Secretary");
    expect(boardSection).not.toHaveTextContent("Speaker Coordinator");
    expect(nonBoardSection).toHaveTextContent("Speaker Coordinator");
    expect(nonBoardSection).not.toHaveTextContent("President");
  });
});
