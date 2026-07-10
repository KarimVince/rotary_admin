import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../test/mocks/server";
import PermissionMatrixManagement from "./PermissionMatrixManagement";

const API_BASE_URL = "http://localhost:8000/api/v1";

const BOARD_POSITION = {
  id: "position-1",
  name: "Treasurer",
  description: "",
  display_order: 0,
  active: true,
  created_at: new Date().toISOString(),
};

const MENU_FUNCTION = {
  id: "menu-fees",
  key: "fees",
  label: "Member Fees",
  module: "Member Fees",
  parent_id: null,
  display_order: 0,
  active: true,
};

const SUBMENU_FUNCTION = {
  id: "submenu-fees-run",
  key: "fees.run",
  label: "Member Fees — Run",
  module: "Member Fees",
  parent_id: "menu-fees",
  display_order: 0,
  active: true,
};

function matrixEntry(appFunction, overrides = {}) {
  return {
    id: `entry-${appFunction.id}`,
    board_position_id: BOARD_POSITION.id,
    app_function_id: appFunction.id,
    access_level: "read",
    is_default_user: false,
    board_position: BOARD_POSITION,
    app_function: appFunction,
    ...overrides,
  };
}

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
}

function mockBaseData(matrix = []) {
  server.use(
    http.get(`${API_BASE_URL}/board/app-functions`, () =>
      HttpResponse.json([MENU_FUNCTION, SUBMENU_FUNCTION]),
    ),
    http.get(`${API_BASE_URL}/board/positions`, () => HttpResponse.json([BOARD_POSITION])),
    http.get(`${API_BASE_URL}/board/permissions/matrix`, () => HttpResponse.json(matrix)),
  );
}

describe("PermissionMatrixManagement", () => {
  it("renders the menu row and its indented submenu row with the Default User column", async () => {
    mockBaseData([matrixEntry(MENU_FUNCTION, { access_level: "write" })]);

    render(<PermissionMatrixManagement />);
    await waitForLoaded();

    expect(screen.getByText("Member Fees")).toBeInTheDocument();
    expect(screen.getByText("Member Fees — Run")).toBeInTheDocument();
    expect(screen.getByText("Treasurer")).toBeInTheDocument();
    expect(screen.getByText("Default User")).toBeInTheDocument();
    expect(screen.getByLabelText("Member Fees — Treasurer")).toHaveValue("write");
    expect(screen.getByLabelText("Member Fees — Default User")).toHaveValue("no_access");
  });

  it("constrains a submenu's options to not exceed its parent menu's current value", async () => {
    mockBaseData([matrixEntry(MENU_FUNCTION, { access_level: "read" })]);

    render(<PermissionMatrixManagement />);
    await waitForLoaded();

    const submenuSelect = screen.getByLabelText("Member Fees — Run — Treasurer");
    const writeOption = Array.from(submenuSelect.options).find((opt) => opt.value === "write");
    expect(writeOption.disabled).toBe(true);
  });

  it("updates a cell's access level and persists it via the API", async () => {
    let currentAccessLevel = "no_access";
    server.use(
      http.get(`${API_BASE_URL}/board/app-functions`, () =>
        HttpResponse.json([MENU_FUNCTION, SUBMENU_FUNCTION]),
      ),
      http.get(`${API_BASE_URL}/board/positions`, () => HttpResponse.json([BOARD_POSITION])),
      http.get(`${API_BASE_URL}/board/permissions/matrix`, () =>
        HttpResponse.json(
          currentAccessLevel === "no_access"
            ? []
            : [matrixEntry(MENU_FUNCTION, { access_level: currentAccessLevel })],
        ),
      ),
      http.put(`${API_BASE_URL}/board/permissions/matrix/cell`, async ({ request }) => {
        const body = await request.json();
        currentAccessLevel = body.access_level;
        return HttpResponse.json({
          entry: matrixEntry(MENU_FUNCTION, { access_level: currentAccessLevel }),
          cascaded: [],
        });
      }),
    );

    render(<PermissionMatrixManagement />);
    await waitForLoaded();

    const select = screen.getByLabelText("Member Fees — Treasurer");
    await userEvent.selectOptions(select, "write");

    await waitFor(() => expect(select).toHaveValue("write"));
  });

  it("surfaces cascaded submenu downgrades reported by the backend", async () => {
    mockBaseData([
      matrixEntry(MENU_FUNCTION, { access_level: "write" }),
      matrixEntry(SUBMENU_FUNCTION, { access_level: "write" }),
    ]);
    server.use(
      http.put(`${API_BASE_URL}/board/permissions/matrix/cell`, () =>
        HttpResponse.json({
          entry: matrixEntry(MENU_FUNCTION, { access_level: "read" }),
          cascaded: [matrixEntry(SUBMENU_FUNCTION, { access_level: "read" })],
        }),
      ),
    );

    render(<PermissionMatrixManagement />);
    await waitForLoaded();

    const select = screen.getByLabelText("Member Fees — Treasurer");
    await userEvent.selectOptions(select, "read");

    expect(await screen.findByText(/also downgraded 1 sub-item/i)).toBeInTheDocument();
  });

  it("shows an error when saving a cell fails", async () => {
    mockBaseData([]);
    server.use(
      http.put(`${API_BASE_URL}/board/permissions/matrix/cell`, () =>
        HttpResponse.json({ detail: "Board position not found" }, { status: 404 }),
      ),
    );

    render(<PermissionMatrixManagement />);
    await waitForLoaded();

    const select = screen.getByLabelText("Member Fees — Treasurer");
    await userEvent.selectOptions(select, "write");

    expect(await screen.findByRole("alert")).toHaveTextContent(/board position not found/i);
  });
});
