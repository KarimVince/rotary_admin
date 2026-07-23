import { Building2, HeartHandshake, Landmark, UtensilsCrossed, Users, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { API_ORIGIN } from "../api/client";
import { fetchDashboardSummary } from "../api/dashboard";
import { listBoardAssignments } from "../api/boardAssignments";
import { listBoardPositions } from "../api/boardPositions";
import { listDinnerEventTypes } from "../api/dinnerEventTypes";
import { listDinnerForecastEvents } from "../api/dinnerForecast";
import Card from "../components/Card";
import { CompactMonthCard, groupEventsByMonth } from "../components/DinnerMonthCard";
import SectionLabel from "../components/SectionLabel";
import { useAccess } from "../hooks/useAccess";
import { useAuth } from "../hooks/useAuth";
import { AVATAR_TONES, getInitials } from "../utils/avatar";
import { currentRotaryYear, rotaryYear as rotaryYearOf } from "../utils/rotaryYear";

// Story 16.21: the current calendar month + the following 2, as "YYYY-MM"
// keys — deliberately calendar-month based (not rotary-year based), unlike
// the Dinner/Events page's full-rotary-year month grid, since this is a
// short "what's coming up" glance rather than a full-year planner. Using
// Date's own month-overflow normalisation (new Date(y, m, 1) with m >= 12)
// keeps a Nov/Dec/Jan or May/Jun/Jul window correct across a year or
// rotary-year boundary without any special-casing here.
function upcomingMonthKeys(count) {
  const now = new Date();
  const keys = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

function initials(member) {
  return getInitials(member.first_name, member.last_name);
}

function resolvePhotoUrl(photoUrl) {
  if (!photoUrl) return null;
  return /^https?:\/\//.test(photoUrl) ? photoUrl : `${API_ORIGIN}${photoUrl}`;
}

const formatEuros = (value) =>
  `${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} €`;

const formatHours = (value) =>
  `${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} h`;

// Redesign: each stat gets its own card + a distinct pastel tone (cycling
// through the tones already defined for the Statistics pages) instead of
// every number sharing one flat hero block.
const STAT_CARDS = [
  { key: "active_members", label: "Active members", tone: "stat-blue", valueClass: "text-[var(--color-brand-blue)]" },
  // Story 8.24: same members-module data, same card component — gated on
  // the "members" Read permission like the Members module link below,
  // unlike the other stat cards here (which aren't permission-gated today).
  {
    key: "honorary_members",
    label: "Honorary members",
    tone: "stat-green",
    valueClass: "text-[#1f7a3d]",
    requiredPermission: "members",
  },
  { key: "organisations_supported", label: "NGOs supported", tone: "stat-lavender", valueClass: "text-[#5b3fa0]" },
  {
    key: "donations_this_year",
    label: "Donations this rotary year",
    format: formatEuros,
    tone: "stat-amber",
    valueClass: "text-[#b8760f]",
  },
  {
    // Story 16.26: replaces the old "Fees Collected" card — sourced from
    // the Finance module (event fundraising income + ad hoc donations),
    // not the Member Fees module.
    key: "total_funds_raised_this_year",
    label: "Total funds raised this rotary year",
    format: formatEuros,
    tone: "stat-rose",
    valueClass: "text-[#b8384a]",
  },
  // Story 16.14 — same NGOs & Donations module data as organisations_supported
  // above; gated on "ngos" read like the module link below, since this is
  // specifically an NGOs & Donations figure (unlike the older cards above,
  // which predate per-card permission gating).
  {
    key: "service_hours_this_year",
    label: "Volunteer hours this rotary year",
    format: formatHours,
    tone: "stat-blue",
    valueClass: "text-[var(--color-brand-blue)]",
    requiredPermission: "ngos",
  },
];

// Story 12.8: each module card's visibility is canRead on its Menu-level
// function (built by 12.1/12.3-12.7) — no separate "dashboard" permission.
const MODULE_LINKS = [
  {
    to: "/members",
    label: "Members",
    description: "Directory & statistics",
    icon: Users,
    tone: "stat-blue",
    iconClass: "text-[var(--color-brand-blue)]",
    requiredPermission: "members",
  },
  {
    to: "/ngos",
    label: "NGO & Services Project",
    description: "Partners & giving",
    icon: Building2,
    tone: "stat-lavender",
    iconClass: "text-[#5b3fa0]",
    requiredPermission: "ngos",
  },
  {
    to: "/friends",
    label: "Friends of Rotary",
    description: "Community contacts",
    icon: HeartHandshake,
    tone: "stat-teal",
    iconClass: "text-[#1a7a68]",
    requiredPermission: "friends",
  },
  {
    to: "/fees",
    label: "Member Fees",
    description: "Billing & collection",
    icon: Wallet,
    tone: "stat-amber",
    iconClass: "text-[#b8760f]",
    requiredPermission: "fees",
  },
  {
    to: "/board/positions",
    label: "Board",
    description: "Positions & assignments",
    icon: Landmark,
    tone: "stat-rose",
    iconClass: "text-[#b8384a]",
    requiredPermission: "board",
  },
  // Story 8.18: gated on the "attendance" menu-level function (10.10),
  // same pattern as every other module card here — no new App Function.
  {
    to: "/dinners",
    label: "Dinner Attendance",
    description: "Events & attendance",
    icon: UtensilsCrossed,
    tone: "stat-green",
    iconClass: "text-[#1f7a3d]",
    requiredPermission: "attendance",
  },
];

export default function Dashboard() {
  const { user } = useAuth();
  const { canRead: canViewMembers } = useAccess("members");
  const { canRead: canViewNgos } = useAccess("ngos");
  const { canRead: canViewFriends } = useAccess("friends");
  const { canRead: canViewFees } = useAccess("fees");
  const { canRead: canViewBoard } = useAccess("board");
  const { canRead: canViewAttendance } = useAccess("attendance");
  // Story 16.21: Club Planning reuses the same Dinner/Events data + gate as
  // the Dinner Attendance module card above, not a new permission.
  const { canRead: canViewPlanning } = useAccess("attendance.forecast");
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [boardCards, setBoardCards] = useState([]);

  const planningMonthKeys = useMemo(() => upcomingMonthKeys(3), []);
  const [planningEvents, setPlanningEvents] = useState([]);
  const [planningEventTypes, setPlanningEventTypes] = useState([]);

  async function loadPlanningEvents() {
    const years = [...new Set(planningMonthKeys.map((key) => rotaryYearOf(`${key}-01`)))];
    const eventsByYear = await Promise.all(
      years.map((year) => listDinnerForecastEvents({ rotary_year: year })),
    );
    const monthKeySet = new Set(planningMonthKeys);
    setPlanningEvents(
      eventsByYear.flat().filter((event) => monthKeySet.has(event.event_date.slice(0, 7))),
    );
  }

  useEffect(() => {
    if (!canViewPlanning) return;
    loadPlanningEvents().catch(() => setPlanningEvents([]));
    listDinnerEventTypes()
      .then(setPlanningEventTypes)
      .catch(() => setPlanningEventTypes([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewPlanning]);

  const planningEventsByMonth = useMemo(
    () => groupEventsByMonth(planningEvents),
    [planningEvents],
  );

  useEffect(() => {
    fetchDashboardSummary()
      .then(setSummary)
      .catch((err) => setError(err.detail || "Failed to load dashboard summary"));
  }, []);

  useEffect(() => {
    if (!canViewBoard) {
      setBoardCards([]);
      return;
    }
    // Story 8.19: non-fatal — the strip just doesn't render if this fails,
    // same convention as the other secondary Dashboard fetches.
    Promise.all([listBoardPositions(), listBoardAssignments(currentRotaryYear())])
      .then(([positions, assignments]) => {
        const activeAssignmentByPosition = new Map();
        assignments
          .filter((assignment) => assignment.end_date === null)
          .forEach((assignment) =>
            activeAssignmentByPosition.set(assignment.board_position_id, assignment),
          );
        const heldPositions = positions
          .filter((position) => position.at_the_board && activeAssignmentByPosition.has(position.id))
          .sort((a, b) => a.display_order - b.display_order);

        // Story: a member holding multiple board positions gets one card
        // listing every role, instead of one duplicate card per position.
        const cardByMemberId = new Map();
        const cards = [];
        heldPositions.forEach((position) => {
          const member = activeAssignmentByPosition.get(position.id).member;
          const existing = cardByMemberId.get(member.id);
          if (existing) {
            existing.positionNames.push(position.name);
            return;
          }
          const card = { member, positionNames: [position.name] };
          cardByMemberId.set(member.id, card);
          cards.push(card);
        });
        setBoardCards(cards);
      })
      .catch(() => setBoardCards([]));
  }, [canViewBoard]);

  const permissionChecks = {
    members: canViewMembers,
    ngos: canViewNgos,
    friends: canViewFriends,
    fees: canViewFees,
    board: canViewBoard,
    attendance: canViewAttendance,
  };

  const visibleModules = MODULE_LINKS.filter(
    (module) => !module.requiredPermission || permissionChecks[module.requiredPermission],
  );

  const visibleStatCards = STAT_CARDS.filter(
    (card) => !card.requiredPermission || permissionChecks[card.requiredPermission],
  );

  const rotaryYear = currentRotaryYear();

  return (
    <div className="dashboard-page">
      <div className="flex items-baseline justify-between">
        <h1 className="mb-1">Welcome, {user?.full_name}</h1>
        <span className="text-sm text-[var(--color-muted-text)]">
          Rotary year {rotaryYear}–{String(rotaryYear + 1).slice(-2)}
        </span>
      </div>
      <p className="mt-0 mb-5 text-sm text-[var(--color-muted-text)]">
        Here's how the club is doing this year.
      </p>
      {error && <p role="alert">{error}</p>}

      <SectionLabel className="mt-6">Club overview</SectionLabel>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-4">
        {visibleStatCards.map((card) => (
          <Card key={card.key} variant={card.tone} className="flex flex-col">
            <span className={`text-3xl font-bold ${card.valueClass}`}>
              {summary
                ? card.format
                  ? card.format(summary[card.key])
                  : summary[card.key]
                : "–"}
            </span>
            <span className="mt-2 text-sm text-[var(--color-brand-blue-dark)]">{card.label}</span>
          </Card>
        ))}
      </div>

      {canViewPlanning && (
        <>
          <SectionLabel className="mt-6">Club Planning</SectionLabel>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
            {planningMonthKeys.map((monthKey) => (
              <CompactMonthCard
                key={monthKey}
                monthKey={monthKey}
                events={planningEventsByMonth.get(monthKey) || []}
                eventTypes={planningEventTypes}
              />
            ))}
          </div>
        </>
      )}

      {boardCards.length > 0 && (
        <>
          <SectionLabel className="mt-6">Board members</SectionLabel>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-4">
            {boardCards.map(({ member, positionNames }, index) => {
              const tone = AVATAR_TONES[index % AVATAR_TONES.length];
              return (
                <Card
                  key={member.id}
                  variant="module-link"
                  className="flex items-center gap-3 text-left"
                >
                  {member.photo_url ? (
                    <img
                      className="w-[var(--avatar-size)] h-[var(--avatar-size)] rounded-full object-cover shrink-0"
                      src={resolvePhotoUrl(member.photo_url)}
                      alt=""
                    />
                  ) : (
                    <div
                      className={`w-[var(--avatar-size)] h-[var(--avatar-size)] rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${tone.bgClass} ${tone.textClass}`}
                    >
                      {initials(member)}
                    </div>
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-[var(--color-brand-blue-dark)] text-sm truncate">
                      {member.first_name} {member.last_name}
                    </span>
                    <span className="text-xs text-[var(--color-muted-text)]">
                      {positionNames.join(" · ")}
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <SectionLabel className="mt-6">Module access</SectionLabel>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {visibleModules.map((module) => {
          const Icon = module.icon;
          return (
            <Link key={module.to} to={module.to} className="no-underline">
              <Card variant="module-link" className="flex items-center gap-3 cursor-pointer">
                <Card variant={module.tone} className="w-10 h-10 !p-0 !rounded-[10px] flex items-center justify-center shrink-0">
                  <Icon className={`w-5 h-5 ${module.iconClass}`} aria-hidden="true" />
                </Card>
                <div className="flex flex-col min-w-0">
                  <span className="font-semibold text-[var(--color-brand-blue-dark)] text-sm">
                    {module.label}
                  </span>
                  <span className="text-xs text-[var(--color-muted-text)] truncate">
                    {module.description}
                  </span>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
