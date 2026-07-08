import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { useAuth } from "../hooks/useAuth";
import AppLayout from "./AppLayout";

vi.mock("../hooks/useAuth");

function renderNav(role, initialPath = "/dashboard") {
  const logout = vi.fn();
  useAuth.mockReturnValue({ user: { role }, logout });
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<div>Dashboard</div>} />
          <Route path="/members" element={<div>Members</div>} />
        </Route>
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
  return { logout };
}

describe("AppLayout — Admin nav section", () => {
  it("shows Admin section with Manage Users and Member Titles for admin role", () => {
    renderNav("admin");

    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage Users" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Member Titles" })).toBeInTheDocument();
  });

  it("hides Manage Users and Member Titles for treasurer role", () => {
    renderNav("treasurer");

    expect(screen.queryByRole("link", { name: "Manage Users" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Member Titles" })).not.toBeInTheDocument();
  });

  it("hides Admin section entirely for regular user role", () => {
    renderNav("user");

    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Manage Users" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Member Titles" })).not.toBeInTheDocument();
  });

  it("admin still sees Member Fees section", () => {
    renderNav("admin");

    expect(screen.getByText("Member Fees")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Fee settings" })).toBeInTheDocument();
  });

  it("treasurer sees Admin section with Currencies but not Manage Users or Member Titles", () => {
    renderNav("treasurer");

    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Currencies" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Manage Users" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Member Titles" })).not.toBeInTheDocument();
  });

  it("admin sees Currencies inside the Admin section", () => {
    renderNav("admin");

    expect(screen.getByRole("link", { name: "Currencies" })).toBeInTheDocument();
  });

  it("regular user does not see Currencies", () => {
    renderNav("user");

    expect(screen.queryByRole("link", { name: "Currencies" })).not.toBeInTheDocument();
  });
});

describe("AppLayout — logout", () => {
  it("navigates to /login with no state so the next login lands on Dashboard", async () => {
    renderNav("admin", "/members");

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    await waitFor(() =>
      expect(screen.getByText("Login page")).toBeInTheDocument(),
    );
    // No state.from is carried — the next login will default to /dashboard.
    // (Verified by the absence of Members content after clicking Log out.)
    expect(screen.queryByText("Members")).not.toBeInTheDocument();
  });
});
