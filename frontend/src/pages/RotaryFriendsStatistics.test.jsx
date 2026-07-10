import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import RotaryFriendsStatistics from "./RotaryFriendsStatistics";

let mockCanRead = true;
vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: mockCanRead, canWrite: mockCanRead }),
}));

const API_BASE_URL = "http://localhost:8000/api/v1";

const STATS = {
  total_friends: 3,
  by_source: [{ label: "Gala 2024", value: 2 }],
  by_tag: [
    { label: "donor", value: 2 },
    { label: "alumni", value: 1 },
  ],
  contactability: [
    { label: "Email only", value: 1 },
    { label: "WhatsApp only", value: 1 },
    { label: "Both", value: 1 },
  ],
};

describe("RotaryFriendsStatistics", () => {
  it("renders the total friends card and chart headings", async () => {
    mockCanRead = true;
    server.use(
      http.get(`${API_BASE_URL}/rotary-friends/statistics`, () => HttpResponse.json(STATS)),
    );

    render(<RotaryFriendsStatistics />);

    expect(await screen.findByText("3")).toBeInTheDocument();
    expect(screen.getByText("Total Friends")).toBeInTheDocument();
    expect(screen.getByText("By source")).toBeInTheDocument();
    expect(screen.getByText("By tag")).toBeInTheDocument();
    expect(screen.getByText("Contactability")).toBeInTheDocument();
  });

  it("shows an empty state when there are no friends", async () => {
    mockCanRead = true;
    server.use(
      http.get(`${API_BASE_URL}/rotary-friends/statistics`, () =>
        HttpResponse.json({
          total_friends: 0,
          by_source: [],
          by_tag: [],
          contactability: [],
        }),
      ),
    );

    render(<RotaryFriendsStatistics />);

    expect(await screen.findByText(/no rotary friends recorded yet/i)).toBeInTheDocument();
  });

  it("shows an error when the statistics request fails", async () => {
    mockCanRead = true;
    server.use(
      http.get(`${API_BASE_URL}/rotary-friends/statistics`, () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 }),
      ),
    );

    render(<RotaryFriendsStatistics />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/server error/i);
  });

  it("denies access for a user with no friends.view access", () => {
    mockCanRead = false;

    render(<RotaryFriendsStatistics />);

    expect(screen.getByRole("alert")).toHaveTextContent(/do not have permission/i);
  });
});
