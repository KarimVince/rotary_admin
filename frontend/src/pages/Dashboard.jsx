import { Building2, HeartHandshake, Landmark, UtensilsCrossed, Users, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_ORIGIN } from "../api/client";
import { fetchDashboardSummary } from "../api/dashboard";
import { listBoardAssignments } from "../api/boardAssignments";
import { listBoardPositions } from "../api/boardPositions";
import Card from "../components/Card";
import { useAccess } from "../hooks/useAccess";
import { useAuth } from "../hooks/useAuth";
import { currentRotaryYear } from "../utils/rotaryYear";

function initials(member) {
  return `${member.first_name?.[0] ?? ""}${member.last_name?.[0] ?? ""}`.toUpperCase();
}

function resolvePhotoUrl(photoUrl) {
  if (!photoUrl) return null;
  return /^https?:\/\//.test(photoUrl) ? photoUrl : `${API_ORIGIN}${photoUrl}`;
}

function computeAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

function boardCardDetail(member) {
  const age = computeAge(member.date_of_birth);
  return [age !== null ? `${age}y` : null, member.gender, member.nationality]
    .filter(Boolean)
    .join(" · ");
}

const formatEuros = (value) =>
  `${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} €`;

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
  { key: "rotary_friends", label: "Friends of Rotary", tone: "stat-teal", valueClass: "text-[#1a7a68]" },
  {
    key: "donations_this_year",
    label: "Donations this rotary year",
    format: formatEuros,
    tone: "stat-amber",
    valueClass: "text-[#b8760f]",
  },
  {
    key: "fees_collected_this_year",
    label: "Fees collected this rotary year",
    format: formatEuros,
    tone: "stat-rose",
    valueClass: "text-[#b8384a]",
  },
];

// Story 12.8: each module card's visibility is canRead on its Menu-level
// function (built by 12.1/12.3-12.7) — no separate "dashboard" permission.
const MODULE_LINKS = [
  { to: "/members", label: "Members", icon: Users, requiredPermission: "members" },
  { to: "/ngos", label: "NGOs & Donations", icon: Building2, requiredPermission: "ngos" },
  { to: "/friends", label: "Friends of Rotary", icon: HeartHandshake, requiredPermission: "friends" },
  { to: "/fees/settings", label: "Member Fees", icon: Wallet, requiredPermission: "fees" },
  { to: "/board/positions", label: "Board", icon: Landmark, requiredPermission: "board" },
  // Story 8.18: gated on the "attendance" menu-level function (10.10),
  // same pattern as every other module card here — no new App Function.
  {
    to: "/dinners/attendance",
    label: "Dinner Attendance",
    icon: UtensilsCrossed,
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
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [boardCards, setBoardCards] = useState([]);

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
        const cards = positions
          .filter((position) => activeAssignmentByPosition.has(position.id))
          .sort((a, b) => a.display_order - b.display_order)
          .map((position) => ({
            position,
            member: activeAssignmentByPosition.get(position.id).member,
          }));
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

  return (
    <div className="dashboard-page">
      <h1>Welcome, {user?.full_name}</h1>
      {error && <p role="alert">{error}</p>}

      <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
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

      {boardCards.length > 0 && (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {boardCards.map(({ position, member }) => {
            const detail = boardCardDetail(member);
            return (
              <Card
                key={position.id}
                variant="module-link"
                className="flex flex-col items-center text-center gap-1"
              >
                {member.photo_url ? (
                  <img
                    className="w-[var(--avatar-size)] h-[var(--avatar-size)] rounded-full object-cover bg-[var(--color-card-border)] shrink-0"
                    src={resolvePhotoUrl(member.photo_url)}
                    alt=""
                  />
                ) : (
                  <div className="w-[var(--avatar-size)] h-[var(--avatar-size)] rounded-full bg-[var(--color-card-border)] flex items-center justify-center text-base font-semibold text-[var(--color-brand-blue-dark)] shrink-0">
                    {initials(member)}
                  </div>
                )}
                <span className="mt-2 font-bold text-[var(--color-brand-blue-dark)]">
                  {position.name}
                </span>
                <span className="text-sm text-[var(--color-brand-blue-dark)]">
                  {member.first_name} {member.last_name}
                </span>
                {detail && (
                  <span className="text-xs text-[var(--color-brand-blue-dark)] truncate w-full">
                    {detail}
                  </span>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {visibleModules.map((module) => {
          const Icon = module.icon;
          return (
            <Link key={module.to} to={module.to} className="no-underline">
              <Card variant="module-link" className="flex items-center gap-3 cursor-pointer">
                <Icon className="w-6 h-6 text-[var(--color-brand-blue)] shrink-0" aria-hidden="true" />
                <span className="font-semibold text-[var(--color-brand-blue-dark)]">
                  {module.label}
                </span>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
