import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import Dashboard from "./Dashboard";

const API_BASE_URL = "http://localhost:8000/api/v1";

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ user: { full_name: "Admin" } }),
}));

describe("Dashboard", () => {
  it("renders stat cards with values from the summary endpoint", async () => {
    server.use(
      http.get(`${API_BASE_URL}/dashboard/summary`, () =>
        HttpResponse.json({
          active_members: 12,
          organisations_supported: 3,
          rotary_friends: 7,
        }),
      ),
    );

    render(<Dashboard />);

    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("Active members")).toBeInTheDocument();
    expect(screen.getByText("NGOs supported")).toBeInTheDocument();
    expect(screen.getByText("Friends of Rotary")).toBeInTheDocument();
  });

  it("shows an error message when the summary request fails", async () => {
    server.use(
      http.get(`${API_BASE_URL}/dashboard/summary`, () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 }),
      ),
    );

    render(<Dashboard />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/server error/i);
  });
});
