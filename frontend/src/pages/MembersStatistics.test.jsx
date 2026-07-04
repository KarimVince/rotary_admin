import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../test/mocks/server";
import MembersStatistics from "./MembersStatistics";

const API_BASE_URL = "http://localhost:8000/api/v1";

const STATS = {
  by_status: [
    { label: "active", value: 12 },
    { label: "past", value: 3 },
  ],
  by_join_year: [
    { label: "2020", value: 5 },
    { label: "2021", value: 4 },
  ],
  average_tenure_years: 2.4,
  growth_by_rotary_year: [{ label: "2020", joins: 5, leaves: 1 }],
  by_nationality: [
    { label: "France", value: 8 },
    { label: "UK", value: 4 },
  ],
  by_classification: [
    { label: "Accounting", value: 6 },
    { label: "Law", value: 2 },
  ],
  age_distribution: [
    { label: "<30", value: 1 },
    { label: "30-39", value: 2 },
    { label: "40-49", value: 3 },
    { label: "50-59", value: 4 },
    { label: "60-69", value: 3 },
    { label: "70+", value: 2 },
  ],
  average_age: 47.3,
};

// recharts' ResponsiveContainer needs real layout dimensions to render its
// SVG children, which jsdom doesn't provide, so chart internals aren't
// reliably queryable here. These tests cover what the page itself renders
// deterministically: the stat cards' computed values and the section
// headings that prove each chart is wired up with data from the API.
describe("MembersStatistics", () => {
  it("renders stat cards computed from the statistics response", async () => {
    server.use(
      http.get(`${API_BASE_URL}/members/statistics`, () => HttpResponse.json(STATS)),
    );

    const { container } = render(<MembersStatistics />);

    await screen.findByText("Active members");
    const values = Array.from(container.querySelectorAll(".stat-value")).map(
      (node) => node.textContent,
    );
    expect(values).toEqual(["12", "3", "2.4", "47.3"]);
  });

  it("renders a section for each chart", async () => {
    server.use(
      http.get(`${API_BASE_URL}/members/statistics`, () => HttpResponse.json(STATS)),
    );

    render(<MembersStatistics />);

    expect(await screen.findByRole("heading", { name: /members by join year/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /growth by rotary year/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /nationality distribution/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /classification distribution/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /age distribution/i })).toBeInTheDocument();
  });

  it("shows an error message when the request fails", async () => {
    server.use(
      http.get(`${API_BASE_URL}/members/statistics`, () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 }),
      ),
    );

    render(<MembersStatistics />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/server error/i);
  });
});
