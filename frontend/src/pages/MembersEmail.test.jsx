import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../test/mocks/server";
import MembersEmail from "./MembersEmail";

const API_BASE_URL = "http://localhost:8000/api/v1";

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
    first_name: "Pat",
    last_name: "Past",
    email: "pat@example.com",
    status: "past",
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
    http.get(`${API_BASE_URL}/members`, () => HttpResponse.json(MEMBERS)),
    http.get(`${API_BASE_URL}/members/email-log`, () => HttpResponse.json(logEntries)),
  );
}

describe("MembersEmail", () => {
  it("shows the email log and defaults to the active-members group", async () => {
    mockLoadHandlers();

    render(<MembersEmail />);
    await waitForLoaded();

    expect(screen.getByText("Old newsletter")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /review send \(1 recipient\)/i })).toBeInTheDocument();
  });

  it("updates the preview count when switching recipient group", async () => {
    mockLoadHandlers();

    render(<MembersEmail />);
    await waitForLoaded();

    await userEvent.selectOptions(screen.getByLabelText(/^group$/i), "all");

    expect(
      screen.getByRole("button", { name: /review send \(2 recipients\)/i }),
    ).toBeInTheDocument();
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

    await userEvent.type(screen.getByLabelText(/subject/i), "Hello");
    await userEvent.type(screen.getByLabelText(/body/i), "World");
    await userEvent.click(screen.getByRole("button", { name: /review send/i }));

    expect(screen.getByRole("heading", { name: /confirm send/i })).toBeInTheDocument();
    expect(screen.getByText(/this will email/i)).toHaveTextContent("1");

    await userEvent.click(screen.getByRole("button", { name: /confirm send/i }));

    await waitFor(() => expect(capturedBody).toEqual({
      subject: "Hello",
      body: "World",
      recipient_group: "active",
    }));
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

    await userEvent.type(screen.getByLabelText(/subject/i), "Hello");
    await userEvent.type(screen.getByLabelText(/body/i), "World");
    await userEvent.click(screen.getByRole("button", { name: /review send/i }));
    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(screen.queryByRole("heading", { name: /confirm send/i })).not.toBeInTheDocument();
    expect(sendWasCalled).toBe(false);
  });

  it("sends to a custom selection of members", async () => {
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

    await userEvent.type(screen.getByLabelText(/subject/i), "Hi");
    await userEvent.type(screen.getByLabelText(/body/i), "There");
    await userEvent.selectOptions(screen.getByLabelText(/send to/i), "custom");
    await userEvent.click(screen.getByLabelText(/select alice active/i));
    await userEvent.click(screen.getByRole("button", { name: /review send \(1 recipient\)/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm send/i }));

    await waitFor(() =>
      expect(capturedBody).toEqual({ subject: "Hi", body: "There", member_ids: ["member-1"] }),
    );
  });

  it("uploads an attachment, allows removing it, and sends the remaining ones", async () => {
    mockLoadHandlers();
    let capturedBody;
    // jsdom/MSW's FormData round-trip doesn't reliably preserve File.name here
    // (it comes back as "blob"), so return filenames by upload order instead
    // of trying to read them back off the parsed request.
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

    await userEvent.type(screen.getByLabelText(/subject/i), "Hello");
    await userEvent.type(screen.getByLabelText(/body/i), "World");

    const flyer = new File(["flyer-bytes"], "flyer.pdf", { type: "application/pdf" });
    const agenda = new File(["agenda-bytes"], "agenda.pdf", { type: "application/pdf" });
    await userEvent.upload(screen.getByLabelText(/attachments/i), flyer);
    await screen.findByText("flyer.pdf");
    await userEvent.upload(screen.getByLabelText(/attachments/i), agenda);
    await screen.findByText("agenda.pdf");

    await userEvent.click(screen.getAllByRole("button", { name: /remove/i })[0]);
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

  it("shows an error if sending fails", async () => {
    mockLoadHandlers();
    server.use(
      http.post(`${API_BASE_URL}/members/email`, () =>
        HttpResponse.json({ detail: "Sender API key is not configured" }, { status: 500 }),
      ),
    );

    render(<MembersEmail />);
    await waitForLoaded();

    await userEvent.type(screen.getByLabelText(/subject/i), "Hello");
    await userEvent.type(screen.getByLabelText(/body/i), "World");
    await userEvent.click(screen.getByRole("button", { name: /review send/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm send/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /sender api key is not configured/i,
    );
  });
});
