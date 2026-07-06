import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../test/mocks/server";
import RotaryFriendsStatistics from "./RotaryFriendsStatistics";

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
    server.use(
      http.get(`${API_BASE_URL}/rotary-friends/statistics`, () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 }),
      ),
    );

    render(<RotaryFriendsStatistics />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/server error/i);
  });
});
