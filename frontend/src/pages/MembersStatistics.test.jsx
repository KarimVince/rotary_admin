import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import MembersStatistics from "./MembersStatistics";

beforeEach(() => {
  sessionStorage.clear();
  // Story 8.23: the page now also fetches the current PPT template on
  // mount, to gate the "Use annual club template" checkbox — default to
  // "none uploaded" for every test unless a test overrides it.
  server.use(
    http.get("http://localhost:8000/api/v1/ppt-templates/current", () =>
      HttpResponse.json(null),
    ),
  );
});

vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: true, canWrite: true }),
}));

const API_BASE_URL = "http://localhost:8000/api/v1";

const STATS = {
  by_status: [
    { label: "active", value: 14 },
    { label: "past", value: 3 },
  ],
  by_join_year: [
    { label: "2020", value: 5 },
    { label: "2021", value: 4 },
  ],
  growth_by_rotary_year: [{ label: "2020", joins: 5, leaves: 1 }],
  by_nationality: [
    { label: "France", value: 8 },
    { label: "UK", value: 4 },
  ],
  age_distribution: [
    { label: "<30", value: 1 },
    { label: "30-39", value: 2 },
    { label: "40-49", value: 3 },
    { label: "50-59", value: 4 },
    { label: "60-69", value: 3 },
    { label: "70+", value: 2 },
  ],
  tenure_distribution: [
    { label: "0-5", value: 4 },
    { label: "5-10", value: 5 },
    { label: "10-20", value: 4 },
    { label: "20+", value: 2 },
  ],
  by_gender: [
    { label: "Female", value: 6 },
    { label: "Male", value: 8 },
    { label: "Unknown", value: 1 },
  ],
  total_members: 14,
  honorary_members: 2,
  new_members_this_rotary_year: 3,
  countries_represented: 5,
  women_count: 6,
  men_count: 8,
  average_age: 47.3,
  average_tenure_as_rotarian: 9.8,
};

// recharts' ResponsiveContainer needs real layout dimensions to render its
// SVG children, which jsdom doesn't provide, so chart internals aren't
// reliably queryable here. These tests cover what the page itself renders
// deterministically: the stat cards' computed values and the section
// headings that prove each chart is wired up with data from the API.
describe("MembersStatistics", () => {
  it("renders Row 1 and Row 2 stat cards computed from the statistics response", async () => {
    server.use(
      http.get(`${API_BASE_URL}/members/statistics`, () => HttpResponse.json(STATS)),
    );

    const { container } = render(<MembersStatistics />);

    await screen.findByText("Total Members");
    const values = Array.from(container.querySelectorAll(".stat-value")).map(
      (node) => node.textContent,
    );
    expect(values).toEqual(["14", "2", "3", "5", "6", "8", "47.3", "9.8"]);

    expect(screen.getByText("Honorary Members")).toBeInTheDocument();
    expect(screen.getByText(/new members/i)).toBeInTheDocument();
    expect(screen.getByText("Countries Represented")).toBeInTheDocument();
    expect(screen.getByText("Number of Women")).toBeInTheDocument();
    expect(screen.getByText("Number of Men")).toBeInTheDocument();
    expect(screen.getByText("Average Age")).toBeInTheDocument();
    expect(screen.getByText(/average tenure/i)).toBeInTheDocument();
  });

  it("never shows a Past Members count card", async () => {
    server.use(
      http.get(`${API_BASE_URL}/members/statistics`, () => HttpResponse.json(STATS)),
    );

    render(<MembersStatistics />);

    await screen.findByText("Total Members");
    expect(screen.queryByText(/past members/i)).not.toBeInTheDocument();
  });

  it("groups related stat cards with matching light-tone classes", async () => {
    server.use(
      http.get(`${API_BASE_URL}/members/statistics`, () => HttpResponse.json(STATS)),
    );

    render(<MembersStatistics />);

    const totalCard = (await screen.findByText("Total Members")).closest(".stat-card");
    const honoraryCard = screen.getByText("Honorary Members").closest(".stat-card");
    const womenCard = screen.getByText("Number of Women").closest(".stat-card");
    const menCard = screen.getByText("Number of Men").closest(".stat-card");
    const ageCard = screen.getByText("Average Age").closest(".stat-card");
    const tenureCard = screen.getByText(/average tenure/i).closest(".stat-card");

    expect(totalCard.className).toBe(honoraryCard.className);
    expect(womenCard.className).toBe(menCard.className);
    expect(ageCard.className).toBe(tenureCard.className);
    expect(womenCard.className).not.toBe(ageCard.className);
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
      screen.getByRole("heading", { name: /tenure distribution/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /gender distribution/i })).toBeInTheDocument();
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

  describe("Generate Report", () => {
    // Patch only the two static methods actually used by the download flow,
    // rather than stubbing the whole URL global — MSW itself relies on the
    // real `new URL(...)` constructor internally to match requests, and
    // replacing the global broke every fetch in these tests.
    let originalCreateObjectURL;
    let originalRevokeObjectURL;

    beforeEach(() => {
      originalCreateObjectURL = URL.createObjectURL;
      originalRevokeObjectURL = URL.revokeObjectURL;
      URL.createObjectURL = vi.fn(() => "blob:mock-url");
      URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    });

    it("downloads a PDF report with the selected format", async () => {
      let requestedFormat;
      server.use(
        http.get(`${API_BASE_URL}/members/statistics`, () => HttpResponse.json(STATS)),
        http.post(`${API_BASE_URL}/members/statistics/report`, ({ request }) => {
          requestedFormat = new URL(request.url).searchParams.get("format");
          return new HttpResponse("fake-pdf-bytes", {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": 'attachment; filename="members-statistics-report.pdf"',
            },
          });
        }),
      );

      render(<MembersStatistics />);
      await screen.findByText("Total Members");

      await userEvent.click(screen.getByRole("button", { name: /generate report/i }));

      await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
      expect(requestedFormat).toBe("pdf");
    });

    it("requests the pptx format when selected", async () => {
      let requestedFormat;
      server.use(
        http.get(`${API_BASE_URL}/members/statistics`, () => HttpResponse.json(STATS)),
        http.post(`${API_BASE_URL}/members/statistics/report`, ({ request }) => {
          requestedFormat = new URL(request.url).searchParams.get("format");
          return new HttpResponse("fake-pptx-bytes", {
            headers: { "Content-Disposition": 'attachment; filename="report.pptx"' },
          });
        }),
      );

      render(<MembersStatistics />);
      await screen.findByText("Total Members");

      await userEvent.selectOptions(screen.getByLabelText(/generate report/i), "pptx");
      await userEvent.click(screen.getByRole("button", { name: /generate report/i }));

      await waitFor(() => expect(requestedFormat).toBe("pptx"));
    });

    it("shows an error if report generation fails", async () => {
      server.use(
        http.get(`${API_BASE_URL}/members/statistics`, () => HttpResponse.json(STATS)),
        http.post(`${API_BASE_URL}/members/statistics/report`, () =>
          HttpResponse.json({ detail: "Report generation failed" }, { status: 500 }),
        ),
      );

      render(<MembersStatistics />);
      await screen.findByText("Total Members");

      await userEvent.click(screen.getByRole("button", { name: /generate report/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/report generation failed/i);
    });

    it("disables the template checkbox with a tooltip when no template is uploaded", async () => {
      server.use(http.get(`${API_BASE_URL}/members/statistics`, () => HttpResponse.json(STATS)));

      render(<MembersStatistics />);
      await screen.findByText("Total Members");

      const checkbox = await screen.findByLabelText(/use annual club template/i);
      await waitFor(() => expect(checkbox).toBeDisabled());
      expect(checkbox.closest("label")).toHaveAttribute(
        "title",
        expect.stringMatching(/no annual template uploaded yet/i),
      );
    });

    it("enables the template checkbox once a template exists for pptx format", async () => {
      server.use(
        http.get(`${API_BASE_URL}/members/statistics`, () => HttpResponse.json(STATS)),
        http.get(`${API_BASE_URL}/ppt-templates/current`, () =>
          HttpResponse.json({
            id: "tpl-1",
            rotary_year: 2026,
            original_filename: "Annual2026.pptx",
            uploaded_by: "user-1",
            uploaded_by_name: "Jane Doe",
            uploaded_at: new Date().toISOString(),
          }),
        ),
      );

      render(<MembersStatistics />);
      await screen.findByText("Total Members");
      await userEvent.selectOptions(screen.getByLabelText(/generate report/i), "pptx");

      await waitFor(() =>
        expect(screen.getByLabelText(/use annual club template/i)).toBeEnabled(),
      );
    });

    it("disables the template checkbox for PDF format even when a template exists", async () => {
      server.use(
        http.get(`${API_BASE_URL}/members/statistics`, () => HttpResponse.json(STATS)),
        http.get(`${API_BASE_URL}/ppt-templates/current`, () =>
          HttpResponse.json({
            id: "tpl-1",
            rotary_year: 2026,
            original_filename: "Annual2026.pptx",
            uploaded_by: null,
            uploaded_by_name: null,
            uploaded_at: new Date().toISOString(),
          }),
        ),
      );

      render(<MembersStatistics />);
      await screen.findByText("Total Members");

      await waitFor(() =>
        expect(screen.getByLabelText(/use annual club template/i)).toBeDisabled(),
      );
    });

    it("sends the selected content type and template flag with the report request", async () => {
      let requestUrl;
      server.use(
        http.get(`${API_BASE_URL}/members/statistics`, () => HttpResponse.json(STATS)),
        http.get(`${API_BASE_URL}/ppt-templates/current`, () =>
          HttpResponse.json({
            id: "tpl-1",
            rotary_year: 2026,
            original_filename: "Annual2026.pptx",
            uploaded_by: null,
            uploaded_by_name: null,
            uploaded_at: new Date().toISOString(),
          }),
        ),
        http.post(`${API_BASE_URL}/members/statistics/report`, ({ request }) => {
          requestUrl = new URL(request.url);
          return new HttpResponse("fake-pptx-bytes", {
            headers: { "Content-Disposition": 'attachment; filename="report.pptx"' },
          });
        }),
      );

      render(<MembersStatistics />);
      await screen.findByText("Total Members");
      await userEvent.selectOptions(screen.getByLabelText(/generate report/i), "pptx");
      await userEvent.selectOptions(screen.getByLabelText(/content/i), "integral");
      await waitFor(() =>
        expect(screen.getByLabelText(/use annual club template/i)).toBeEnabled(),
      );
      await userEvent.click(screen.getByLabelText(/use annual club template/i));
      await userEvent.click(screen.getByRole("button", { name: /generate report/i }));

      await waitFor(() => expect(requestUrl).toBeDefined());
      expect(requestUrl.searchParams.get("format")).toBe("pptx");
      expect(requestUrl.searchParams.get("type")).toBe("integral");
      expect(requestUrl.searchParams.get("use_template")).toBe("true");
    });

    it("remembers the content type and template choice across remounts in the same session", async () => {
      server.use(
        http.get(`${API_BASE_URL}/members/statistics`, () => HttpResponse.json(STATS)),
        http.get(`${API_BASE_URL}/ppt-templates/current`, () =>
          HttpResponse.json({
            id: "tpl-1",
            rotary_year: 2026,
            original_filename: "Annual2026.pptx",
            uploaded_by: null,
            uploaded_by_name: null,
            uploaded_at: new Date().toISOString(),
          }),
        ),
      );

      const { unmount } = render(<MembersStatistics />);
      await screen.findByText("Total Members");
      await userEvent.selectOptions(screen.getByLabelText(/generate report/i), "pptx");
      await userEvent.selectOptions(screen.getByLabelText(/content/i), "integral");
      await waitFor(() =>
        expect(screen.getByLabelText(/use annual club template/i)).toBeEnabled(),
      );
      await userEvent.click(screen.getByLabelText(/use annual club template/i));
      unmount();

      render(<MembersStatistics />);
      await screen.findByText("Total Members");
      expect(screen.getByLabelText(/content/i)).toHaveValue("integral");
      await waitFor(() =>
        expect(screen.getByLabelText(/use annual club template/i)).toBeChecked(),
      );
    });
  });
});
