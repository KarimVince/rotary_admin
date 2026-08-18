import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import { ThemeProvider } from "../context/ThemeContext";
import RotaryFriendsEmail from "./RotaryFriendsEmail";

let mockCanRead = true;
let mockCanWrite = true;
vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: mockCanRead, canWrite: mockCanWrite }),
}));

function renderPage() {
  return render(
    <ThemeProvider>
      <RotaryFriendsEmail />
    </ThemeProvider>,
  );
}

const API_BASE_URL = "http://localhost:8000/api/v1";

const FRIENDS = [
  {
    id: "friend-1",
    first_name: "Sara",
    last_name: "Nguyen",
    email: "sara@example.com",
    whatsapp: null,
    tags: "donor, alumni",
  },
  {
    id: "friend-2",
    first_name: "Jamie",
    last_name: "Lee",
    email: "jamie@example.com",
    whatsapp: null,
    tags: "sponsor",
  },
  {
    id: "friend-3",
    first_name: "Whats",
    last_name: "App",
    email: null,
    whatsapp: "+85298765432",
    tags: "donor",
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
    http.get(`${API_BASE_URL}/rotary-friends`, () => HttpResponse.json(FRIENDS)),
    http.get(`${API_BASE_URL}/rotary-friends/email-log`, () => HttpResponse.json(logEntries)),
    http.get(`${API_BASE_URL}/email-drafts`, () => HttpResponse.json(drafts)),
  );
}

function typeIntoBody(text) {
  const editor = screen.getByTestId("email-body-editor");
  editor.textContent = text;
  fireEvent.input(editor);
}

describe("RotaryFriendsEmail", () => {
  it("shows the email log; the picker excludes whatsapp-only contacts", async () => {
    mockLoadHandlers();

    renderPage();
    await waitForLoaded();

    expect(screen.getByText("Old newsletter")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /add recipients/i }));
    await userEvent.click(screen.getByRole("button", { name: /^all$/i }));
    await userEvent.click(screen.getByRole("button", { name: /^select shown$/i }));
    await userEvent.click(screen.getByRole("button", { name: /^done$/i }));

    // Only 2 of the 3 friends have an email — the whatsapp-only contact
    // never appears in the picker at all.
    expect(
      screen.getByRole("button", { name: /review send \(2 recipients\)/i }),
    ).toBeInTheDocument();
  });

  it("bulk-selects recipients by tag via a quick-filter chip", async () => {
    mockLoadHandlers();

    renderPage();
    await waitForLoaded();

    await userEvent.click(screen.getByRole("button", { name: /add recipients/i }));
    await userEvent.click(screen.getByRole("button", { name: /^donor$/i }));
    await userEvent.click(screen.getByRole("button", { name: /^select shown$/i }));
    await userEvent.click(screen.getByRole("button", { name: /^done$/i }));

    // "donor" matches Sara (has email) and Whats App (whatsapp-only, not
    // selectable) — only Sara ends up selected.
    expect(
      screen.getByRole("button", { name: /review send \(1 recipient\)/i }),
    ).toBeInTheDocument();
  });

  it("sends to a custom selection of friends", async () => {
    mockLoadHandlers();
    let capturedBody;
    server.use(
      http.post(`${API_BASE_URL}/rotary-friends/email`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          email_log_id: "log-2",
          status: "sent",
          recipient_count: 1,
          success_count: 1,
          failure_count: 0,
          skipped_no_email_count: 0,
        });
      }),
    );

    renderPage();
    await waitForLoaded();

    await userEvent.type(screen.getByPlaceholderText(/subject/i), "Hi");
    typeIntoBody("There");
    await userEvent.click(screen.getByRole("button", { name: /add recipients/i }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Sara Nguyen" }));
    await userEvent.click(screen.getByRole("button", { name: /^done$/i }));

    await userEvent.click(screen.getByRole("button", { name: /review send \(1 recipient\)/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm send/i }));

    await waitFor(() =>
      expect(capturedBody).toEqual({ subject: "Hi", body: "There", friend_ids: ["friend-1"] }),
    );
  });

  it("shows a confirmation step and reports the send result", async () => {
    mockLoadHandlers();
    server.use(
      http.post(`${API_BASE_URL}/rotary-friends/email`, () =>
        HttpResponse.json({
          email_log_id: "log-3",
          status: "sent",
          recipient_count: 2,
          success_count: 2,
          failure_count: 0,
          skipped_no_email_count: 0,
        }),
      ),
    );

    renderPage();
    await waitForLoaded();

    await userEvent.type(screen.getByPlaceholderText(/subject/i), "Hello");
    typeIntoBody("World");
    await userEvent.click(screen.getByRole("button", { name: /add recipients/i }));
    await userEvent.click(screen.getByRole("button", { name: /^select shown$/i }));
    await userEvent.click(screen.getByRole("button", { name: /^done$/i }));
    await userEvent.click(screen.getByRole("button", { name: /review send/i }));

    expect(screen.getByRole("heading", { name: /confirm send/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /confirm send/i }));

    expect(await screen.findByText(/last send: sent/i)).toBeInTheDocument();
  });

  it("uploads attachments via the shared attachment endpoint and sends them", async () => {
    mockLoadHandlers();
    let capturedBody;
    server.use(
      http.post(`${API_BASE_URL}/members/email/attachments`, () =>
        HttpResponse.json(
          { filename: "flyer.pdf", url: "http://localhost:8000/static/email-attachments/flyer.pdf" },
          { status: 201 },
        ),
      ),
      http.post(`${API_BASE_URL}/rotary-friends/email`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          email_log_id: "log-4",
          status: "sent",
          recipient_count: 2,
          success_count: 2,
          failure_count: 0,
          skipped_no_email_count: 0,
        });
      }),
    );

    renderPage();
    await waitForLoaded();

    await userEvent.type(screen.getByPlaceholderText(/subject/i), "Hello");
    typeIntoBody("World");
    await userEvent.click(screen.getByRole("button", { name: /add recipients/i }));
    await userEvent.click(screen.getByRole("button", { name: /^select shown$/i }));
    await userEvent.click(screen.getByRole("button", { name: /^done$/i }));

    const flyer = new File(["flyer-bytes"], "flyer.pdf", { type: "application/pdf" });
    const dropzoneInput = document.querySelector('input[type="file"][multiple]');
    await userEvent.upload(dropzoneInput, flyer);
    await screen.findByText("flyer.pdf");

    await userEvent.click(screen.getByRole("button", { name: /review send/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm send/i }));

    await waitFor(() =>
      expect(capturedBody?.attachments).toEqual([
        {
          filename: "flyer.pdf",
          url: "http://localhost:8000/static/email-attachments/flyer.pdf",
        },
      ]),
    );
  });

  it("shows an error if sending fails", async () => {
    mockLoadHandlers();
    server.use(
      http.post(`${API_BASE_URL}/rotary-friends/email`, () =>
        HttpResponse.json({ detail: "Resend API key is not configured" }, { status: 500 }),
      ),
    );

    renderPage();
    await waitForLoaded();

    await userEvent.type(screen.getByPlaceholderText(/subject/i), "Hello");
    typeIntoBody("World");
    await userEvent.click(screen.getByRole("button", { name: /add recipients/i }));
    await userEvent.click(screen.getByRole("button", { name: /^select shown$/i }));
    await userEvent.click(screen.getByRole("button", { name: /^done$/i }));
    await userEvent.click(screen.getByRole("button", { name: /review send/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm send/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /resend api key is not configured/i,
    );
  });

  it("denies access for a user with no friends.send_email access", () => {
    mockCanRead = false;
    mockCanWrite = false;

    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent(/do not have permission/i);
  });

  it("disables the send button for a user with read but not write access", async () => {
    mockCanRead = true;
    mockCanWrite = false;
    mockLoadHandlers();

    renderPage();
    await waitForLoaded();

    expect(screen.getByText("Old newsletter")).toBeInTheDocument();
    const sendButton = screen.getByRole("button", { name: /review send/i });
    expect(sendButton).toBeDisabled();
    expect(sendButton).toHaveAttribute("title", expect.stringMatching(/do not have permission/i));
  });

  describe("Drafts (Story 16.19)", () => {
    const DRAFT = {
      id: "draft-1",
      source_module: "rotary_friends",
      subject: "Saved subject",
      body: "Saved body",
      recipient_group: null,
      tag: null,
      member_ids: null,
      friend_ids: ["friend-1"],
      attachments: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it("saves a new draft", async () => {
      mockCanRead = true;
      mockCanWrite = true;
      mockLoadHandlers();
      let capturedBody;
      server.use(
        http.post(`${API_BASE_URL}/email-drafts`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({ ...DRAFT, id: "draft-new" }, { status: 201 });
        }),
      );

      renderPage();
      await waitForLoaded();

      await userEvent.type(screen.getByPlaceholderText(/subject/i), "Hi");
      typeIntoBody("There");
      await userEvent.click(screen.getByRole("button", { name: /add recipients/i }));
      await userEvent.click(screen.getByRole("checkbox", { name: "Sara Nguyen" }));
      await userEvent.click(screen.getByRole("button", { name: /^done$/i }));
      await userEvent.click(screen.getByRole("button", { name: /save draft/i }));

      await waitFor(() =>
        expect(capturedBody).toEqual({
          source_module: "rotary_friends",
          subject: "Hi",
          body: "There",
          friend_ids: ["friend-1"],
          attachments: [],
        }),
      );
    });

    it("shows saved drafts and loads one into the compose form on Edit", async () => {
      mockCanRead = true;
      mockCanWrite = true;
      mockLoadHandlers([LOG_ENTRY], [DRAFT]);

      renderPage();
      await waitForLoaded();

      expect(screen.getByText("Saved subject")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Edit" }));

      expect(screen.getByPlaceholderText(/subject/i)).toHaveValue("Saved subject");
      expect(screen.getByTestId("email-body-editor")).toHaveTextContent("Saved body");
      expect(
        screen.getByRole("button", { name: /review send \(1 recipient\)/i }),
      ).toBeInTheDocument();
    });

    it("deletes a draft after confirmation", async () => {
      mockCanRead = true;
      mockCanWrite = true;
      mockLoadHandlers([LOG_ENTRY], [DRAFT]);
      let deleteCalled = false;
      server.use(
        http.delete(`${API_BASE_URL}/email-drafts/draft-1`, () => {
          deleteCalled = true;
          return new HttpResponse(null, { status: 204 });
        }),
      );
      vi.spyOn(window, "confirm").mockReturnValue(true);

      renderPage();
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(deleteCalled).toBe(true));
      window.confirm.mockRestore();
    });

    it("does not show a New Draft button while composing a brand-new message", async () => {
      mockCanRead = true;
      mockCanWrite = true;
      mockLoadHandlers();

      renderPage();
      await waitForLoaded();

      expect(screen.queryByRole("button", { name: /new draft/i })).not.toBeInTheDocument();
    });

    it("shows New Draft after saving, and resets the form to start a second draft without a refresh", async () => {
      mockCanRead = true;
      mockCanWrite = true;
      mockLoadHandlers();
      server.use(
        http.post(`${API_BASE_URL}/email-drafts`, async () =>
          HttpResponse.json({ ...DRAFT, id: "draft-new" }, { status: 201 }),
        ),
      );

      renderPage();
      await waitForLoaded();

      await userEvent.type(screen.getByPlaceholderText(/subject/i), "Hi");
      typeIntoBody("There");
      await userEvent.click(screen.getByRole("button", { name: /add recipients/i }));
      await userEvent.click(screen.getByRole("checkbox", { name: "Sara Nguyen" }));
      await userEvent.click(screen.getByRole("button", { name: /^done$/i }));
      await userEvent.click(screen.getByRole("button", { name: /save draft/i }));

      const newDraftButton = await screen.findByRole("button", { name: /new draft/i });
      await userEvent.click(newDraftButton);

      expect(screen.getByPlaceholderText(/subject/i)).toHaveValue("");
      expect(screen.getByTestId("email-body-editor")).toHaveTextContent("");
      expect(screen.queryByRole("button", { name: /new draft/i })).not.toBeInTheDocument();

      // Saving again should create a second draft, not update the first one.
      let capturedBody;
      server.use(
        http.post(`${API_BASE_URL}/email-drafts`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({ ...DRAFT, id: "draft-second" }, { status: 201 });
        }),
      );

      await userEvent.type(screen.getByPlaceholderText(/subject/i), "Second");
      typeIntoBody("Second body");
      await userEvent.click(screen.getByRole("button", { name: /save draft/i }));

      await waitFor(() => expect(capturedBody?.subject).toBe("Second"));
    });

    it("clears the New Draft button after resuming an edit and clicking it", async () => {
      mockCanRead = true;
      mockCanWrite = true;
      mockLoadHandlers([LOG_ENTRY], [DRAFT]);

      renderPage();
      await waitForLoaded();

      await userEvent.click(screen.getByRole("button", { name: "Edit" }));
      expect(screen.getByPlaceholderText(/subject/i)).toHaveValue("Saved subject");

      await userEvent.click(screen.getByRole("button", { name: /new draft/i }));

      expect(screen.getByPlaceholderText(/subject/i)).toHaveValue("");
      expect(screen.queryByRole("button", { name: /new draft/i })).not.toBeInTheDocument();
    });
  });
});
