import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../test/mocks/server";
import RotaryFriendsEmail from "./RotaryFriendsEmail";

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

function mockLoadHandlers(logEntries = [LOG_ENTRY]) {
  server.use(
    http.get(`${API_BASE_URL}/rotary-friends`, () => HttpResponse.json(FRIENDS)),
    http.get(`${API_BASE_URL}/rotary-friends/email-log`, () => HttpResponse.json(logEntries)),
  );
}

describe("RotaryFriendsEmail", () => {
  it("shows the email log and defaults to all friends with email", async () => {
    mockLoadHandlers();

    render(<RotaryFriendsEmail />);
    await waitForLoaded();

    expect(screen.getByText("Old newsletter")).toBeInTheDocument();
    // 2 of the 3 friends have an email — the whatsapp-only contact is excluded.
    expect(
      screen.getByRole("button", { name: /review send \(2 recipients\)/i }),
    ).toBeInTheDocument();
  });

  it("filters recipients by tag and skips whatsapp-only contacts", async () => {
    mockLoadHandlers();

    render(<RotaryFriendsEmail />);
    await waitForLoaded();

    await userEvent.selectOptions(screen.getByLabelText(/send to/i), "tag");
    await userEvent.selectOptions(screen.getByLabelText(/^tag$/i), "donor");

    // "donor" matches Sara (has email) and Whats App (whatsapp only, skipped).
    expect(
      screen.getByRole("button", { name: /review send \(1 recipient\)/i }),
    ).toBeInTheDocument();

    // Fill required fields before submitting the form
    await userEvent.type(screen.getByLabelText(/subject/i), "Test");
    await userEvent.type(screen.getByLabelText(/body/i), "Test");

    await userEvent.click(screen.getByRole("button", { name: /review send/i }));
    expect(screen.getByText(/this will email/i)).toHaveTextContent(/1 contact skipped/i);
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

    render(<RotaryFriendsEmail />);
    await waitForLoaded();

    await userEvent.type(screen.getByLabelText(/subject/i), "Hi");
    await userEvent.type(screen.getByLabelText(/body/i), "There");
    await userEvent.selectOptions(screen.getByLabelText(/send to/i), "custom");
    await userEvent.click(screen.getByLabelText(/select sara nguyen/i));
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

    render(<RotaryFriendsEmail />);
    await waitForLoaded();

    await userEvent.type(screen.getByLabelText(/subject/i), "Hello");
    await userEvent.type(screen.getByLabelText(/body/i), "World");
    await userEvent.click(screen.getByRole("button", { name: /review send/i }));

    expect(screen.getByRole("heading", { name: /confirm send/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /confirm send/i }));

    expect(await screen.findByText(/last send: sent/i)).toBeInTheDocument();
  });

  it("uploads an attachment via the shared attachment endpoint and sends it", async () => {
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

    render(<RotaryFriendsEmail />);
    await waitForLoaded();

    await userEvent.type(screen.getByLabelText(/subject/i), "Hello");
    await userEvent.type(screen.getByLabelText(/body/i), "World");

    const flyer = new File(["flyer-bytes"], "flyer.pdf", { type: "application/pdf" });
    await userEvent.upload(screen.getByLabelText(/attachments/i), flyer);
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

    render(<RotaryFriendsEmail />);
    await waitForLoaded();

    await userEvent.type(screen.getByLabelText(/subject/i), "Hello");
    await userEvent.type(screen.getByLabelText(/body/i), "World");
    await userEvent.click(screen.getByRole("button", { name: /review send/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm send/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /resend api key is not configured/i,
    );
  });
});
