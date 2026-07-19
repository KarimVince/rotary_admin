import {
  Building2,
  CalendarDays,
  HeartHandshake,
  Landmark,
  LayoutDashboard,
  Menu,
  Shield,
  Users,
  Utensils,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAccess } from "../hooks/useAccess";
import { useAuth } from "../hooks/useAuth";
import BrandHeader from "./BrandHeader";
import Footer from "./Footer";
import NavSection from "./NavSection";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    // Story 12.3: visibility driven by the members/members.* permissions
    // rather than open-by-default / adminOnly.
    section: "Members",
    icon: Users,
    requiredPermission: "members",
    children: [
      { to: "/members", label: "Directory", end: true, requiredPermission: "members.directory" },
      {
        to: "/members/statistics",
        label: "Statistics",
        requiredPermission: "members.statistics",
      },
      { to: "/members/email", label: "Email Members", requiredPermission: "members.email" },
    ],
  },
  {
    // Story 12.4: visibility driven by the ngos/ngos.* permissions.
    section: "NGOs & Donations",
    icon: Building2,
    requiredPermission: "ngos",
    children: [
      {
        to: "/ngos",
        label: "Organisations",
        end: true,
        requiredPermission: "ngos.organisations",
      },
      { to: "/ngos/statistics", label: "Statistics", requiredPermission: "ngos.statistics" },
    ],
  },
  {
    // Story 12.6: visibility driven by the friends/friends.* permissions
    // (re-pointed from friends.view / friends.send_email).
    section: "Friends of Rotary",
    icon: HeartHandshake,
    requiredPermission: "friends",
    children: [
      { to: "/friends", label: "Directory", end: true, requiredPermission: "friends.directory" },
      {
        to: "/friends/statistics",
        label: "Statistics",
        requiredPermission: "friends.statistics",
      },
      {
        to: "/friends/email",
        label: "Send Message",
        requiredPermission: "friends.send_message",
      },
    ],
  },
  {
    // Story 12.5: visibility driven by the fees/fees.* permissions
    // (re-pointed from the flat invoices.view/invoices.manage pair).
    section: "Member Fees",
    icon: Wallet,
    requiredPermission: "fees",
    children: [
      { to: "/fees/tracking", label: "Fee tracking", requiredPermission: "fees.tracking" },
      { to: "/fees/run", label: "Fee run", requiredPermission: "fees.run" },
      {
        to: "/fees/settings",
        label: "Fee settings",
        end: true,
        requiredPermission: "fees.settings",
      },
      {
        to: "/fees/statistics",
        label: "Fee statistics",
        requiredPermission: "fees.statistics",
      },
    ],
  },
  {
    // Story 16.8 — Dinner Forecast + Attendance merged into one page/route,
    // so the nav collapses from a 2-child section to a single top-level
    // item (same treatment as Dashboard below), gated by attendance.forecast
    // since that's the permission key the merged page itself checks.
    to: "/dinners",
    label: "Dinner / Events",
    icon: Utensils,
    requiredPermission: "attendance.forecast",
  },
  {
    // Story 14.13: consolidated from 7 sub-pages into 2 — Event List and
    // the bento-style Manage Project page (panels reached via ?panel=,
    // each still individually gated by its own matrix key at render time).
    section: "Event",
    icon: CalendarDays,
    requiredPermission: "event",
    children: [
      { to: "/events", label: "Event List", end: true, requiredPermission: "event.list" },
      { to: "/events/manage", label: "Manage Project", requiredPermission: "event" },
    ],
  },
  {
    // Story 12.7: board.members/board.positions are matrix-driven now.
    // Permissions (matrix editor) is the one permanent, hardcoded
    // admin-only exception.
    section: "Board",
    icon: Landmark,
    requiredPermission: "board",
    children: [
      {
        to: "/board/members",
        label: "Board Members",
        end: true,
        requiredPermission: "board.members",
      },
      {
        to: "/board/positions",
        label: "Position Definitions",
        requiredPermission: "board.positions",
      },
      { to: "/admin/permissions", label: "Permissions", adminOnly: true },
    ],
  },
  {
    // Story 12.7: admin.member_titles/admin.currencies are matrix-driven
    // now. Manage Users is the other permanent, hardcoded admin-only
    // exception.
    section: "Admin",
    icon: Shield,
    requiredPermission: "admin",
    children: [
      { to: "/admin/users", label: "Manage Users", adminOnly: true },
      {
        to: "/admin/member-titles",
        label: "Member Titles",
        requiredPermission: "admin.member_titles",
      },
      {
        to: "/admin/honorifics",
        label: "Honorifics",
        requiredPermission: "admin.honorifics",
      },
      { to: "/admin/currencies", label: "Currencies", requiredPermission: "admin.currencies" },
      {
        to: "/admin/ngo-classifications",
        label: "NGO Classifications",
        requiredPermission: "admin.ngo_classifications",
      },
      {
        to: "/admin/ppt-template",
        label: "PPT Template",
        requiredPermission: "admin.ppt_template",
      },
      {
        to: "/admin/dinner-event-types",
        label: "Dinner Event Types",
        requiredPermission: "admin.dinner_event_types",
      },
    ],
  },
];

// Finds which section (if any) owns the given pathname, so that section can
// auto-expand — both on first load and after subsequent navigation.
function sectionForPath(pathname, sections) {
  const match = sections.find(
    (item) => item.children && item.children.some((child) => pathname.startsWith(child.to)),
  );
  return match ? match.section : null;
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { canRead: canViewFees } = useAccess("fees");
  const { canRead: canViewFeesTracking } = useAccess("fees.tracking");
  const { canRead: canViewFeesRun } = useAccess("fees.run");
  const { canRead: canViewFeesSettings } = useAccess("fees.settings");
  const { canRead: canViewFeesStatistics } = useAccess("fees.statistics");
  const { canRead: canViewFriends } = useAccess("friends");
  const { canRead: canViewFriendsDirectory } = useAccess("friends.directory");
  const { canRead: canViewFriendsStatistics } = useAccess("friends.statistics");
  const { canRead: canSendFriendEmails } = useAccess("friends.send_message");
  const { canRead: canViewMembers } = useAccess("members");
  const { canRead: canViewMembersDirectory } = useAccess("members.directory");
  const { canRead: canViewMembersStatistics } = useAccess("members.statistics");
  const { canRead: canViewMembersEmail } = useAccess("members.email");
  const { canRead: canViewNgos } = useAccess("ngos");
  const { canRead: canViewNgosOrganisations } = useAccess("ngos.organisations");
  const { canRead: canViewNgosStatistics } = useAccess("ngos.statistics");
  const { canRead: canViewBoard } = useAccess("board");
  const { canRead: canViewBoardMembers } = useAccess("board.members");
  const { canRead: canViewBoardPositions } = useAccess("board.positions");
  const { canRead: canViewAdmin } = useAccess("admin");
  const { canRead: canViewAdminMemberTitles } = useAccess("admin.member_titles");
  const { canRead: canViewAdminHonorifics } = useAccess("admin.honorifics");
  const { canRead: canViewAdminCurrencies } = useAccess("admin.currencies");
  const { canRead: canViewAdminNgoClassifications } = useAccess("admin.ngo_classifications");
  const { canRead: canViewAdminPptTemplate } = useAccess("admin.ppt_template");
  const { canRead: canViewAdminDinnerEventTypes } = useAccess("admin.dinner_event_types");
  const { canRead: canViewAttendanceForecast } = useAccess("attendance.forecast");
  const { canRead: canViewEvent } = useAccess("event");
  const { canRead: canViewEventList } = useAccess("event.list");
  const { canRead: canViewEventGuests } = useAccess("event.guests");
  const { canRead: canViewEventAuction } = useAccess("event.auction");
  const { canRead: canViewEventCosts } = useAccess("event.costs");
  const { canRead: canViewEventSponsors } = useAccess("event.sponsors");
  const { canRead: canViewEventSummary } = useAccess("event.summary");
  const { canRead: canViewEventRundown } = useAccess("event.rundown");
  const { canRead: canViewEventSetup } = useAccess("event.setup");

  const permissionChecks = {
    fees: canViewFees,
    "fees.tracking": canViewFeesTracking,
    "fees.run": canViewFeesRun,
    "fees.settings": canViewFeesSettings,
    "fees.statistics": canViewFeesStatistics,
    friends: canViewFriends,
    "friends.directory": canViewFriendsDirectory,
    "friends.statistics": canViewFriendsStatistics,
    "friends.send_message": canSendFriendEmails,
    members: canViewMembers,
    "members.directory": canViewMembersDirectory,
    "members.statistics": canViewMembersStatistics,
    "members.email": canViewMembersEmail,
    ngos: canViewNgos,
    "ngos.organisations": canViewNgosOrganisations,
    "ngos.statistics": canViewNgosStatistics,
    board: canViewBoard,
    "board.members": canViewBoardMembers,
    "board.positions": canViewBoardPositions,
    admin: canViewAdmin,
    "admin.member_titles": canViewAdminMemberTitles,
    "admin.honorifics": canViewAdminHonorifics,
    "admin.currencies": canViewAdminCurrencies,
    "admin.ngo_classifications": canViewAdminNgoClassifications,
    "admin.ppt_template": canViewAdminPptTemplate,
    "admin.dinner_event_types": canViewAdminDinnerEventTypes,
    "attendance.forecast": canViewAttendanceForecast,
    event: canViewEvent,
    "event.list": canViewEventList,
    "event.guests": canViewEventGuests,
    "event.auction": canViewEventAuction,
    "event.costs": canViewEventCosts,
    "event.sponsors": canViewEventSponsors,
    "event.summary": canViewEventSummary,
    "event.rundown": canViewEventRundown,
    "event.setup": canViewEventSetup,
  };

  // Story 12.9: one consistent rule for the whole nav — Menu-level
  // requiredPermission governs section visibility, Submenu-level governs
  // child visibility, with adminOnly kept only as the permanent, documented
  // exception for Manage Users and Permissions (never matrix-driven).
  const visibleSections = NAV_ITEMS.filter(
    (item) => !item.requiredPermission || permissionChecks[item.requiredPermission],
  );

  // Computed synchronously from the current route during the initial render
  // (not via a post-mount effect) so the correct section is already open on
  // first paint — nothing to animate on load, only on later clicks/navigation.
  const [openSection, setOpenSection] = useState(() =>
    sectionForPath(location.pathname, visibleSections),
  );
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  useEffect(() => {
    const activeSection = sectionForPath(location.pathname, visibleSections);
    if (activeSection && activeSection !== openSection) {
      setOpenSection(activeSection);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  function toggleSection(section) {
    setOpenSection((current) => (current === section ? null : section));
  }

  function closeMobileNav() {
    setIsMobileNavOpen(false);
  }

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-shell">
      {/* Redesign: header is plain white, no bottom border — the detached
          nav card below supplies its own shadow, so no line is needed to
          separate header from body or nav from main. */}
      <header className="app-header bg-white border-b-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="md:hidden !p-0 bg-transparent inline-flex items-center justify-center w-9 h-9 rounded-lg text-[var(--color-brand-blue-dark)] hover:bg-[var(--color-brand-blue-light)]"
            onClick={() => setIsMobileNavOpen((open) => !open)}
            aria-label={isMobileNavOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={isMobileNavOpen}
          >
            {isMobileNavOpen ? (
              <X className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Menu className="w-5 h-5" aria-hidden="true" />
            )}
          </button>
          <BrandHeader size="small" />
        </div>
        <button type="button" onClick={handleLogout}>
          Log out
        </button>
      </header>
      <div className="app-body relative bg-white gap-5 !p-0 md:p-5">
        {isMobileNavOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/40 md:hidden"
            onClick={closeMobileNav}
            aria-hidden="true"
          />
        )}
        {/* Detached vertical nav card: no border, own rounded corners +
            shadow, lighter blue fill, margin from the header/main/edges
            instead of a flush full-height sidebar with a divider line. */}
        <nav
          className={`fixed inset-y-5 left-5 z-40 w-64 overflow-y-auto bg-[var(--color-brand-blue-light)] rounded-2xl shadow-[var(--shadow-nav-card)] p-3 flex flex-col gap-1 transform transition-transform duration-200 ease-out md:static md:z-auto md:inset-auto md:self-start md:max-h-full md:translate-x-0 ${
            isMobileNavOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {visibleSections.map((item) =>
            item.children ? (
              <NavSection
                key={item.section}
                icon={item.icon}
                label={item.section}
                items={item.children.filter(
                  (child) =>
                    (!child.adminOnly || user?.role === "admin") &&
                    (!child.requiredPermission || permissionChecks[child.requiredPermission]),
                )}
                isOpen={openSection === item.section}
                onToggle={() => toggleSection(item.section)}
                onNavigate={closeMobileNav}
              />
            ) : (
              // Dashboard (no sub-items): same chip treatment as the
              // section header rows below, so it doesn't stand out as a
              // differently-styled row.
              <NavLink
                key={item.to}
                to={item.to}
                onClick={closeMobileNav}
                className={({ isActive }) =>
                  `no-underline flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    isActive
                      ? "bg-[var(--color-brand-blue)] text-white"
                      : "bg-[var(--color-brand-blue-chip)] text-[var(--color-brand-blue-dark)] hover:brightness-95"
                  }`
                }
              >
                {item.icon && <item.icon className="w-4 h-4 shrink-0" aria-hidden="true" />}
                {item.label}
              </NavLink>
            ),
          )}
        </nav>
        <main className="app-content md:pt-3">
          <Outlet />
        </main>
      </div>
      <Footer />
    </div>
  );
}
