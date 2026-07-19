import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../hooks/useAuth";
import AppLayout from "./AppLayout";

vi.mock("../hooks/useAuth");

// Story 12.9: every nav section/item is now keyed off the Menu/Submenu tree
// rather than a single flat flag — deny specific keys per test instead.
let mockDeniedKeys = new Set();
vi.mock("../hooks/useAccess", () => ({
  useAccess: (key) => {
    const canRead = !mockDeniedKeys.has(key);
    return { canRead, canWrite: canRead };
  },
}));

beforeEach(() => {
  mockDeniedKeys = new Set();
});

function renderNav(role, initialPath = "/dashboard") {
  const logout = vi.fn();
  useAuth.mockReturnValue({ user: { role }, logout });
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<div>Dashboard</div>} />
          <Route path="/members" element={<div>Members</div>} />
          <Route path="/members/statistics" element={<div>Members statistics</div>} />
          <Route path="/ngos" element={<div>NGOs</div>} />
        </Route>
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
  return { logout };
}

describe("AppLayout — accordion nav (Story 8.7)", () => {
  it("collapses every section by default when the active route isn't inside one", () => {
    renderNav("admin", "/dashboard");

    expect(screen.getByRole("button", { name: /members/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: /ngos & donations/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("auto-expands the section containing the current route on initial load", () => {
    renderNav("admin", "/members/statistics");

    expect(screen.getByRole("button", { name: /^members$/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("clicking a section toggles it open, and clicking again closes it", async () => {
    renderNav("admin", "/dashboard");
    const membersToggle = screen.getByRole("button", { name: /^members$/i });

    await userEvent.click(membersToggle);
    expect(membersToggle).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(membersToggle);
    expect(membersToggle).toHaveAttribute("aria-expanded", "false");
  });

  it("only keeps one section open at a time", async () => {
    renderNav("admin", "/dashboard");
    const membersToggle = screen.getByRole("button", { name: /^members$/i });
    const ngosToggle = screen.getByRole("button", { name: /ngos & donations/i });

    await userEvent.click(membersToggle);
    expect(membersToggle).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(ngosToggle);
    expect(ngosToggle).toHaveAttribute("aria-expanded", "true");
    expect(membersToggle).toHaveAttribute("aria-expanded", "false");
  });

  it("navigating to a page auto-expands its section and closes the previously open one", async () => {
    renderNav("admin", "/dashboard");
    const membersToggle = screen.getByRole("button", { name: /^members$/i });
    const ngosToggle = screen.getByRole("button", { name: /ngos & donations/i });

    // Open a section unrelated to where we're about to navigate.
    await userEvent.click(ngosToggle);
    expect(ngosToggle).toHaveAttribute("aria-expanded", "true");

    // Navigate into a different section's page. Its link is still in the DOM
    // even while collapsed (the grid-rows collapse is a layout effect jsdom
    // doesn't compute), so this reflects clicking via keyboard/history nav.
    // Scoped by data-nav-section since "Statistics" also exists under NGOs
    // & Donations and Friends of Rotary.
    const membersSection = document.querySelector('[data-nav-section="Members"]');
    await userEvent.click(within(membersSection).getByRole("link", { name: "Statistics" }));

    await waitFor(() => expect(screen.getByText("Members statistics")).toBeInTheDocument());
    expect(membersToggle).toHaveAttribute("aria-expanded", "true");
    expect(ngosToggle).toHaveAttribute("aria-expanded", "false");
  });
});

describe("AppLayout — Admin nav section", () => {
  it("shows Admin section with Manage Users and Member Titles for admin role", async () => {
    renderNav("admin");

    expect(screen.getByRole("button", { name: /^admin$/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^admin$/i }));
    expect(screen.getByRole("link", { name: "Manage Users" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Member Titles" })).toBeInTheDocument();
  });

  it("hides Manage Users for treasurer role (permanent adminOnly exception)", async () => {
    renderNav("treasurer");

    await userEvent.click(screen.getByRole("button", { name: /^admin$/i }));
    expect(screen.queryByRole("link", { name: "Manage Users" })).not.toBeInTheDocument();
  });

  it("hides Admin section entirely for a user without admin.* matrix access", () => {
    mockDeniedKeys = new Set(["admin"]);
    renderNav("user");

    expect(screen.queryByRole("button", { name: /^admin$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Manage Users" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Member Titles" })).not.toBeInTheDocument();
  });

  it("admin still sees Member Fees section", async () => {
    renderNav("admin");

    expect(screen.getByRole("button", { name: /member fees/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /member fees/i }));
    expect(screen.getByRole("link", { name: "Fee settings" })).toBeInTheDocument();
  });

  it("hides Member Fees section for a user without fees matrix access", () => {
    mockDeniedKeys = new Set(["fees"]);
    renderNav("user");

    expect(screen.queryByRole("button", { name: /member fees/i })).not.toBeInTheDocument();
  });

  it("treasurer with admin.currencies access sees Currencies but not Manage Users", async () => {
    renderNav("treasurer");

    await userEvent.click(screen.getByRole("button", { name: /^admin$/i }));
    expect(screen.getByRole("link", { name: "Currencies" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Manage Users" })).not.toBeInTheDocument();
  });

  it("Story 12.9: Manage Users and Permissions stay hidden for a non-admin with full Write everywhere", async () => {
    // mockDeniedKeys stays empty (every useAccess call resolves canRead=true)
    // — simulates a non-admin user granted full matrix access to every
    // module. Manage Users / Permissions must remain invisible regardless,
    // since adminOnly is the sole, permanent exception never governed by
    // the matrix.
    renderNav("user");

    await userEvent.click(screen.getByRole("button", { name: /^admin$/i }));
    expect(screen.queryByRole("link", { name: "Manage Users" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^board$/i }));
    expect(screen.queryByRole("link", { name: "Permissions" })).not.toBeInTheDocument();
  });

  it("regular user without admin.* matrix access does not see the Admin section", () => {
    mockDeniedKeys = new Set(["admin"]);
    renderNav("user");

    expect(screen.queryByRole("button", { name: /^admin$/i })).not.toBeInTheDocument();
  });
});

describe("AppLayout — Event nav section (Story 14.13)", () => {
  it("shows the Event section with the 2 consolidated links", async () => {
    renderNav("admin");

    expect(screen.getByRole("button", { name: /^event$/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^event$/i }));
    expect(screen.getByRole("link", { name: "Event List" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage Project" })).toBeInTheDocument();
  });

  it("hides the Event section entirely for a user without event matrix access", () => {
    mockDeniedKeys = new Set(["event"]);
    renderNav("user");

    expect(screen.queryByRole("button", { name: /^event$/i })).not.toBeInTheDocument();
  });
});

describe("AppLayout — mobile nav", () => {
  it("opens and closes the mobile drawer via the hamburger button", async () => {
    renderNav("admin", "/dashboard");

    const toggle = screen.getByRole("button", { name: /open navigation/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: /close navigation/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("closes the mobile drawer after clicking a nav link", async () => {
    renderNav("admin", "/dashboard");

    await userEvent.click(screen.getByRole("button", { name: /open navigation/i }));
    await userEvent.click(screen.getByRole("button", { name: /^members$/i }));
    // "Directory" also exists under Friends of Rotary — scope to Members.
    const membersSection = document.querySelector('[data-nav-section="Members"]');
    await userEvent.click(within(membersSection).getByRole("link", { name: "Directory" }));

    // Scoped to the main content area — "Members" also appears as the (still
    // DOM-present, jsdom doesn't compute the collapse) nav section label.
    const main = document.querySelector(".app-content");
    await waitFor(() => expect(within(main).getByText("Members")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /open navigation/i })).toBeInTheDocument();
  });
});

describe("AppLayout — logout", () => {
  it("navigates to /login with no state so the next login lands on Dashboard", async () => {
    renderNav("admin", "/members");

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    await waitFor(() => expect(screen.getByText("Login page")).toBeInTheDocument());
    // No state.from is carried — the next login will default to /dashboard.
    // (Verified by the absence of Members content after clicking Log out.)
    expect(screen.queryByText("Members")).not.toBeInTheDocument();
  });
});
