import { Building2, HeartHandshake, Landmark, Users, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchDashboardSummary } from "../api/dashboard";
import Card from "../components/Card";
import { useAccess } from "../hooks/useAccess";
import { useAuth } from "../hooks/useAuth";

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
];

export default function Dashboard() {
  const { user } = useAuth();
  const { canRead: canViewMembers } = useAccess("members");
  const { canRead: canViewNgos } = useAccess("ngos");
  const { canRead: canViewFriends } = useAccess("friends");
  const { canRead: canViewFees } = useAccess("fees");
  const { canRead: canViewBoard } = useAccess("board");
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDashboardSummary()
      .then(setSummary)
      .catch((err) => setError(err.detail || "Failed to load dashboard summary"));
  }, []);

  const permissionChecks = {
    members: canViewMembers,
    ngos: canViewNgos,
    friends: canViewFriends,
    fees: canViewFees,
    board: canViewBoard,
  };

  const visibleModules = MODULE_LINKS.filter(
    (module) => !module.requiredPermission || permissionChecks[module.requiredPermission],
  );

  return (
    <div className="dashboard-page">
      <h1>Welcome, {user?.full_name}</h1>
      {error && <p role="alert">{error}</p>}

      <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {STAT_CARDS.map((card) => (
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
