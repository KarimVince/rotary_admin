import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import OrganisationProjectFile from "./OrganisationProjectFile";

const API = "http://localhost:8000/api/v1/organisations/org-1/service-projects";
const MEMBERS = [{ id: "m-1", first_name: "Jane", last_name: "Doe" }];

const PROJECT_2025 = {
  id: "p-2025",
  organisation_id: "org-1",
  rotary_year: 2025,
  status: "in_progress",
  lead_member_id: "m-1",
  lead_member_name: "Jane Doe",
  objectives: "Feed 200 families",
  plan: "Collect food in December",
  outcome: null,
  documents: [
    {
      id: "d-1",
      service_project_id: "p-2025",
      description: "Budget v2",
      file_original_filename: "budget.xlsx",
      file_content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      file_size_bytes: 2048,
      uploaded_by: "u-1",
      uploaded_by_name: "Admin",
      created_at: "2025-09-01T00:00:00Z",
    },
  ],
  created_by: "u-1",
  created_at: "2025-08-01T00:00:00Z",
  last_updated_by: "u-1",
  last_updated_by_name: "Admin",
  last_updated_at: "2025-09-01T00:00:00Z",
};

function renderSection({ canWrite = true, projects = [PROJECT_2025] } = {}) {
  server.use(http.get(API, () => HttpResponse.json(projects)));
  return render(
    <OrganisationProjectFile
      organisationId="org-1"
      members={MEMBERS}
      canWrite={canWrite}
      yearOptions={[2026, 2025, 2024]}
      defaultYear={2025}
    />,
  );
}

describe("OrganisationProjectFile", () => {
  it("shows the selected year's plan and documents read-only for read users", async () => {
    renderSection({ canWrite: false });
    expect(await screen.findByText("Feed 200 families")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("budget.xlsx")).toBeInTheDocument();
    expect(screen.getByText("2 KB")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Upload document")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save project file" })).not.toBeInTheDocument();
  });

  it("shows an empty state for a read user when the year has no file", async () => {
    renderSection({ canWrite: false, projects: [] });
    expect(await screen.findByText(/No project file for 2025–2026 yet/)).toBeInTheDocument();
  });

  it("lets a write user save the plan for the selected year", async () => {
    const user = userEvent.setup();
    let saved;
    server.use(
      http.put(`${API}/2025`, async ({ request }) => {
        saved = await request.json();
        return HttpResponse.json({ ...PROJECT_2025, ...saved });
      }),
    );
    renderSection();
    const objectives = await screen.findByLabelText("Objectives");
    await waitFor(() => expect(objectives).toHaveValue("Feed 200 families"));

    await user.clear(objectives);
    await user.type(objectives, "Feed 300 families");
    await user.selectOptions(screen.getByLabelText("Status"), "completed");
    await user.click(screen.getByRole("button", { name: "Save project file" }));

    await waitFor(() => expect(saved).toBeDefined());
    expect(saved).toMatchObject({
      status: "completed",
      lead_member_id: "m-1",
      objectives: "Feed 300 families",
    });
    expect(await screen.findByText("Project file saved")).toBeInTheDocument();
  });

  it("uploads a document with its description", async () => {
    const user = userEvent.setup();
    let uploaded;
    server.use(
      http.post(`${API}/2025/documents`, async ({ request }) => {
        uploaded = await request.formData();
        return HttpResponse.json(PROJECT_2025, { status: 201 });
      }),
    );
    renderSection();
    const fileInput = await screen.findByLabelText("Upload document");
    await user.upload(fileInput, new File(["pdf"], "proposal.pdf", { type: "application/pdf" }));
    await user.type(screen.getByLabelText("Description (optional)"), "Proposal");
    await user.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(uploaded).toBeDefined());
    // jsdom + MSW drop the File name in the multipart round-trip; check a file was sent.
    expect(uploaded.has("file")).toBe(true);
    expect(uploaded.get("description")).toBe("Proposal");
  });

  it("deletes a document after confirmation", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let deleted = false;
    server.use(
      http.delete(`${API}/2025/documents/d-1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderSection();
    const row = (await screen.findByText("budget.xlsx")).closest("tr");
    await user.click(within(row).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleted).toBe(true));
  });

  it("switches year from the history chips", async () => {
    const user = userEvent.setup();
    const project2024 = { ...PROJECT_2025, id: "p-2024", rotary_year: 2024, objectives: "Old goal", documents: [] };
    renderSection({ canWrite: false, projects: [PROJECT_2025, project2024] });
    await screen.findByText("Feed 200 families");
    await user.click(screen.getByRole("button", { name: /2024–2025 · In progress · 0 docs/ }));
    expect(await screen.findByText("Old goal")).toBeInTheDocument();
    expect(screen.getByText("No documents uploaded for this year yet.")).toBeInTheDocument();
  });
});
