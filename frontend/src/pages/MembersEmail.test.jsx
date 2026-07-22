import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import MembersEmail from "./MembersEmail";

vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: true, canWrite: true }),
}));

const API_BASE_URL = "http://localhost:8000/api/v1";

// Member email only ever targets active members — the mock mirrors what
// the real `GET /members?status=active` call returns (see doc/CLAUDE.md
// "Member email specifics").
const MEMBERS = [
  {
    id: "member-1",
    first_name: "Alice",
    last_name: "Active",
    email: "alice@example.com",
    status: "active",
  },
  {
    id: "member-2",
    first_name: "Bob",
    last_name: "Boone",
    email: "bob@example.com",
    status: "active",
  },
];

const LOG_ENTRY = {
  id: "log-1",
  subject: "Old newsletter",
  recipient_group: "all",
  recipient_count: 2,
  status: "sent",
  sent_at: new Date().toISOString(),
};

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
}

function mockLoadHandlers(logEntries = [LOG_ENTRY], drafts = []) {
  server.use(
    http.get(`${API_BASE_URL}/members`, () => HttpResponse.json(MEMBERS)),
    http.get(`${API_BASE_URL}/members/email-log`, () => HttpResponse.json(logEntries)),
    http.get(`${API_BASE_URL}/email-drafts`, () => HttpResponse.json(drafts)),
  );
}

function typeIntoBody(text) {
  const editor = screen.getByTestId("email-body-editor");
  editor.textContent = text;
  fireEvent.input(editor);
}

async function selectRecipient(name) {
  await userEvent.click(screen.getByRole("button", { name: /add recipients/i }));
  await userEvent.click(screen.getByRole("checkbox", { name }));
  await userEvent.click(screen.getByRole("button", { name: /^done$/i }));
}

describe("MembersEmail", () => {
  it("shows the email log", async () => {
    mockLoadHandlers();

    render(<MembersEmail />);
    await waitForLoaded();

    expect(screen.getByText("Old newsletter")).toBeInTheDocument();
    expect(screen.getByText("Sent")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /review send \(0 recipients\)/i })).toBeInTheDocument();
  });

  it("shows an empty state when nothing has been sent yet", async () => {
    mockLoadHandlers([]);

    render(<MembersEmail />);
    await waitForLoaded();

    expect(screen.getByText(/no emails sent yet/i)).toBeInTheDocument();
  });

  it("selects and clears every recipient via the top-level Select all action", async () => {
    mockLoadHandlers();

    render(<MembersEmail />);
    await waitForLoaded();

    await userEvent.click(screen.getByRole("button", { name: /^select all$/i }));
    expect(screen.getByRole("button", { name: /review send \(2 recipients\)/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^clear all$/i }));
    expect(screen.getByRole("button", { name: /review send \(0 recipients\)/i })).toBeInTheDocument();
  });

  it("shows a confirmation step before sending, then sends on confirm", async () => {
    mockLoadHandlers();
    let capturedBody;
    server.use(
      http.post(`${API_BASE_URL}/members/email`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          email_log_id: "log-2",
          status: "sent",
          recipient_count: 1,
          success_count: 1,
          failure_count: 0,
        });
      }),
    );

    render(<MembersEmail />);
    await waitForLoaded();

    await userEvent.type(screen.getByPlaceholderText(/subject/i), "Hello");
    typeIntoBody("World");
    await selectRecipient("Alice Active");
    await userEvent.click(screen.getByRole("button", { name: /review send/i }));

    expect(screen.getByRole("heading", { name: /confirm send/i })).toBeInTheDocument();
    expect(screen.getByText(/this will email/i)).toHaveTextContent("1");

    await userEvent.click(screen.getByRole("button", { name: /confirm send/i }));

    await waitFor(() =>
      expect(capturedBody).toEqual({
        subject: "Hello",
        body: "World",
        member_ids: ["member-1"],
      }),
    );
    expect(await screen.findByText(/last send: sent/i)).toBeInTheDocument();
  });

  it("cancelling the confirmation step returns to the compose form without sending", async () => {
    mockLoadHandlers();
    let sendWasCalled = false;
    server.use(
      http.post(`${API_BASE_URL}/members/email`, () => {
        sendWasCalled = true;
        return HttpResponse.json({});
      }),
    );

    render(<MembersEmail />);
    await waitForLoaded();

    await userEvent.type(screen.getByPlaceholderText(/subject/i), "Hello");
    typeIntoBody("World");
    await selectRecipient("Alice Active");
    await userEvent.click(screen.getByRole("button", { name: /review send/i }));
    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(screen.queryByRole("heading", { name: /confirm send/i })).not.toBeInTheDocument();
    expect(sendWasCalled).toBe(false);
  });

  it("sends to a custom selection of members via search", async () => {
    mockLoadHandlers();
    let capturedBody;
    server.use(
      http.post(`${API_BASE_URL}/members/email`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          email_log_id: "log-3",
          status: "sent",
          recipient_count: 1,
          success_count: 1,
          failure_count: 0,
        });
      }),
    );

    render(<MembersEmail />);
    await waitForLoaded();

    await userEvent.type(screen.getByPlaceholderText(/subject/i), "Hi");
    typeIntoBody("There");

    await userEvent.click(screen.getByRole("button", { name: /add recipients/i }));
    await userEvent.type(screen.getByPlaceholderText(/search/i), "Alice");
    await userEvent.click(screen.getByRole("checkbox", { name: "Alice Active" }));
    await userEvent.click(screen.getByRole("button", { name: /^done$/i }));

    await userEvent.click(screen.getByRole("button", { name: /review send \(1 recipient\)/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm send/i }));

    await waitFor(() =>
      expect(capturedBody).toEqual({ subject: "Hi", body: "There", member_ids: ["member-1"] }),
    );
  });

  it("uploads attachments, allows removing one, and sends the remaining ones", async () => {
    mockLoadHandlers();
    let capturedBody;
    const uploadedFilenames = ["flyer.pdf", "agenda.pdf"];
    let uploadCount = 0;
    server.use(
      http.post(`${API_BASE_URL}/members/email/attachments`, () => {
        const filename = uploadedFilenames[uploadCount];
        uploadCount += 1;
        return HttpResponse.json(
          { filename, url: `http://localhost:8000/static/email-attachments/${filename}` },
          { status: 201 },
        );
      }),
      http.post(`${API_BASE_URL}/members/email`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          email_log_id: "log-4",
          status: "sent",
          recipient_count: 1,
          success_count: 1,
          failure_count: 0,
        });
      }),
    );

    render(<MembersEmail />);
    await waitForLoaded();

    await userEvent.type(screen.getByPlaceholderText(/subject/i), "Hello");
    typeIntoBody("World");
    await selectRecipient("Alice Active");

    const flyer = new File(["flyer-bytes"], "flyer.pdf", { type: "application/pdf" });
    const agenda = new File(["agenda-bytes"], "agenda.pdf", { type: "application/pdf" });
    const dropzoneInput = document.querySelector('input[type="file"][multiple]');
    await userEvent.upload(dropzoneInput, [flyer, agenda]);
    await screen.findByText("flyer.pdf");
    await screen.findByText("agenda.pdf");

    await userEvent.click(screen.getAllByRole("button", { name: /remove flyer.pdf/i })[0]);
    expect(screen.queryByText("flyer.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("agenda.pdf")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /review send/i }));
    expect(screen.getByText(/this will email/i)).toHaveTextContent("1 attachment");
    await userEvent.click(screen.getByRole("button", { name: /confirm send/i }));

    await waitFor(() =>
      expect(capturedBody?.attachments).toEqual([
        {
          filename: "agenda.pdf",
          url: "http://localhost:8000/static/email-attachments/agenda.pdf",
        },
      ]),
    );
  });

  it("inserts an uploaded image inline into the body", async () => {
    mockLoadHandlers();
    server.use(
      http.post(`${API_BASE_URL}/members/email/attachments`, () =>
        HttpResponse.json(
          { filename: "photo.png", url: "http://localhost:8000/static/email-attachments/photo.png" },
          { status: 201 },
        ),
      ),
    );

    render(<MembersEmail />);
    await waitForLoaded();

    const photo = new File(["photo-bytes"], "photo.png", { type: "image/png" });
    const imageInput = document.querySelector('input[type="file"][accept="image/*"]');
    await userEvent.upload(imageInput, photo);

    await waitFor(() => {
      expect(screen.getByTestId("email-body-editor").innerHTML).toContain(
        "http://localhost:8000/static/email-attachments/photo.png",
      );
    });
  });

  it("shows an error if sending fails", async () => {
    mockLoadHandlers();
    server.use(
      http.post(`${API_BASE_URL}/members/email`, () =>
        HttpResponse.json({ detail: "Resend API key is not configured" }, { status: 500 }),
      ),
    );

    render(<MembersEmail />);
    await waitForLoaded();

    await userEvent.type(screen.getByPlaceholderText(/subject/i), "Hello");
    typeIntoBody("World");
    await selectRecipient("Alice Active");
    await userEvent.click(screen.getByRole("button", { name: /review send/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm send/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /resend api key is not configured/i,
    );
  });

  describe("Drafts (Story 16.19)", () => {
    const DRAFT = {
      id: "draft-1",
      source_module: "members",
      subject: "Saved subject",
      body: "Saved body",
      recipient_group: null,
      member_ids: ["member-1"],
      friend_ids: null,
      attachments: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it("saves a new draft and lists it", async () => {
      mockLoadHandlers();
      let capturedBody;
      server.use(
        http.post(`${API_BASE_URL}/email-drafts`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({ ...DRAFT, id: "draft-new" }, { status: 201 });
        }),
      );

      render(<MembersEmail />);
      await waitForLoaded();

      await userEvent.type(screen.getByPlaceholderText(/subject/i), "Hello");
      typeIntoBody("World");
      await selectRecipient("Alice Active");
      await userEvent.click(screen.getByRole("button", { name: /save draft/i }));

      await waitFor(() =>
        expect(capturedBody).toEqual({
          source_module: "members",
          subject: "Hello",
          body: "World",
          member_ids: ["member-1"],
          attachments: [],
        }),
      );
    });

    it("shows saved drafts, and loads one into the compose form on Edit", async () => {
      mockLoadHandlers([LOG_ENTRY], [DRAFT]);

      render(<MembersEmail />);
      await waitForLoaded();

      expect(screen.getByText("Saved subject")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Edit" }));

      expect(screen.getByPlaceholderText(/subject/i)).toHaveValue("Saved subject");
      expect(screen.getByTestId("email-body-editor")).toHaveTextContent("Saved body");
      expect(screen.getByRole("button", { name: /review send \(1 recipient\)/i })).toBeInTheDocument();
    });

    it("deletes a draft after confirmation", async () => {
      mockLoadHandlers([LOG_ENTRY], [DRAFT]);
      let deleteCalled = false;
      server.use(
        http.delete(`${API_BASE_URL}/email-drafts/draft-1`, () => {
          deleteCalled = true;
          return new HttpResponse(null, { status: 204 });
        }),
      );
      vi.spyOn(window, "confirm").mockReturnValue(true);

      render(<MembersEmail />);
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(deleteCalled).toBe(true));
      window.confirm.mockRestore();
    });

    it("deletes the draft once it has been sent", async () => {
      mockLoadHandlers([LOG_ENTRY], [DRAFT]);
      let deleteCalled = false;
      server.use(
        http.post(`${API_BASE_URL}/members/email`, () =>
          HttpResponse.json({
            email_log_id: "log-5",
            status: "sent",
            recipient_count: 1,
            success_count: 1,
            failure_count: 0,
          }),
        ),
        http.delete(`${API_BASE_URL}/email-drafts/draft-1`, () => {
          deleteCalled = true;
          return new HttpResponse(null, { status: 204 });
        }),
      );

      render(<MembersEmail />);
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: "Edit" }));
      await userEvent.click(screen.getByRole("button", { name: /review send/i }));
      await userEvent.click(screen.getByRole("button", { name: /confirm send/i }));

      await waitFor(() => expect(deleteCalled).toBe(true));
    });
  });
});
