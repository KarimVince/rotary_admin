import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import RotaryFriendsStatistics from "./RotaryFriendsStatistics";

let mockCanRead = true;
vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: mockCanRead, canWrite: mockCanRead }),
}));

const API_BASE_URL = "http://localhost:8000/api/v1";

beforeEach(() => {
  sessionStorage.clear();
  server.use(
    http.get(`${API_BASE_URL}/ppt-templates/current`, () => HttpResponse.json(null)),
  );
});

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

  describe("Generate Report (Story 8.32)", () => {
    let originalCreateObjectURL;
    let originalRevokeObjectURL;

    beforeEach(() => {
      mockCanRead = true;
      originalCreateObjectURL = URL.createObjectURL;
      originalRevokeObjectURL = URL.revokeObjectURL;
      URL.createObjectURL = vi.fn(() => "blob:mock-url");
      URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    });

    it("downloads a report with the selected format and content type", async () => {
      let requestUrl;
      server.use(
        http.get(`${API_BASE_URL}/rotary-friends/statistics`, () => HttpResponse.json(STATS)),
        http.post(`${API_BASE_URL}/rotary-friends/statistics/report`, ({ request }) => {
          requestUrl = new URL(request.url);
          return new HttpResponse("fake-pdf-bytes", {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": 'attachment; filename="friends-statistics_2026-07-14.pdf"',
            },
          });
        }),
      );

      render(<RotaryFriendsStatistics />);
      await screen.findByText("Total Friends");

      await userEvent.selectOptions(screen.getByLabelText("Content"), "integral");
      await userEvent.click(screen.getByRole("button", { name: /generate report/i }));

      await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
      expect(requestUrl.searchParams.get("format")).toBe("pdf");
      expect(requestUrl.searchParams.get("type")).toBe("integral");
    });

    it("disables the annual template checkbox until a template exists and PPTX is selected", async () => {
      server.use(
        http.get(`${API_BASE_URL}/rotary-friends/statistics`, () => HttpResponse.json(STATS)),
        http.get(`${API_BASE_URL}/ppt-templates/current`, () =>
          HttpResponse.json({ id: "t1", rotary_year: 2026 }),
        ),
      );

      render(<RotaryFriendsStatistics />);
      await screen.findByText("Total Friends");

      const checkbox = await screen.findByLabelText(/use annual club template/i);
      expect(checkbox).toBeDisabled();

      await userEvent.selectOptions(screen.getByLabelText("Generate report"), "pptx");
      await waitFor(() => expect(checkbox).toBeEnabled());
    });
  });
});
