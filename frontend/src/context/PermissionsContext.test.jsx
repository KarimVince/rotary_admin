import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { useAccess } from "../hooks/useAccess";
import { server } from "../test/mocks/server";
import { PermissionsProvider } from "./PermissionsContext";

const API_BASE_URL = "http://localhost:8000/api/v1";

let mockIsAuthenticated = true;
vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: mockIsAuthenticated }),
}));

function wrapper({ children }) {
  return <PermissionsProvider>{children}</PermissionsProvider>;
}

describe("PermissionsContext / useAccess", () => {
  it("resolves canRead/canWrite from the fetched permissions map", async () => {
    mockIsAuthenticated = true;
    server.use(
      http.get(`${API_BASE_URL}/board/permissions/me`, () =>
        HttpResponse.json({ donations: "write", "member-fees": "read" }),
      ),
    );

    const { result } = renderHook(
      () => ({
        donations: useAccess("donations"),
        fees: useAccess("member-fees"),
        unknown: useAccess("something-unseeded"),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.donations).toEqual({ canRead: true, canWrite: true }));
    expect(result.current.fees).toEqual({ canRead: true, canWrite: false });
    expect(result.current.unknown).toEqual({ canRead: false, canWrite: false });
  });

  it("defaults to no access when the user is not authenticated", async () => {
    mockIsAuthenticated = false;
    server.use(
      http.get(`${API_BASE_URL}/board/permissions/me`, () =>
        HttpResponse.json({ donations: "write" }),
      ),
    );

    const { result } = renderHook(() => useAccess("donations"), { wrapper });

    expect(result.current).toEqual({ canRead: false, canWrite: false });
  });

  it("fails closed (no access) when the permissions request errors", async () => {
    mockIsAuthenticated = true;
    server.use(
      http.get(`${API_BASE_URL}/board/permissions/me`, () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 }),
      ),
    );

    const { result } = renderHook(() => useAccess("donations"), { wrapper });

    await waitFor(() => expect(result.current).toEqual({ canRead: false, canWrite: false }));
  });

  it("throws when useAccess is used outside a PermissionsProvider", () => {
    const { result } = renderHook(() => {
      try {
        return useAccess("donations");
      } catch (err) {
        return err;
      }
    });

    expect(result.current).toBeInstanceOf(Error);
  });
});
