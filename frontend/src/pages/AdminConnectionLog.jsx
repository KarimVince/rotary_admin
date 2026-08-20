import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchConnectionLogStats, listConnectionLogs } from "../api/connectionLogs";
import SingleSelectDropdown from "../components/SingleSelectDropdown";
import { useAccess } from "../hooks/useAccess";

function formatDateTime(isoString) {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// STORY 16.34 — Admin login audit log with graphical usage stats. Confirmed
// scope: successful logins only (see backend/app/api/auth.py's login
// endpoint), IP address captured (not device), indefinite retention, and
// all three stats the story itself suggested: a logins-over-time trend
// chart, a most-active-users chart, and a last-login-per-user quick-scan
// list — this page has no separate "write" action (it's a pure log/report
// view), so it self-gates on canRead alone.
export default function AdminConnectionLog() {
  const { canRead } = useAccess("admin.connection_log");

  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(null);

  const [logs, setLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);
  const [logsError, setLogsError] = useState(null);

  const [userFilter, setUserFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    if (!canRead) return;
    fetchConnectionLogStats()
      .then(setStats)
      .catch((err) => setStatsError(err.detail || "Failed to load login statistics"));
  }, [canRead]);

  async function loadLogs() {
    setIsLoadingLogs(true);
    setLogsError(null);
    try {
      const filters = {};
      if (userFilter) filters.user_id = userFilter;
      if (dateFrom) filters.date_from = dateFrom;
      if (dateTo) filters.date_to = dateTo;
      setLogs(await listConnectionLogs(filters));
    } catch (err) {
      setLogsError(err.detail || "Failed to load the connection log");
    } finally {
      setIsLoadingLogs(false);
    }
  }

  useEffect(() => {
    if (!canRead) {
      setIsLoadingLogs(false);
      return;
    }
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead, userFilter, dateFrom, dateTo]);

  // The user filter dropdown's options come from the stats' own
  // last_login list (every user, fetched once) rather than a separate call
  // to GET /users — that endpoint is admin-role-only, which would 403 for
  // a Secretary/President/President Elect who has matrix write on this
  // page but isn't the "admin" role.
  const userOptions = useMemo(() => {
    const users = stats?.last_login ?? [];
    return [
      { value: "", label: "All users" },
      ...users.map((u) => ({ value: u.user_id, label: u.full_name })),
    ];
  }, [stats]);

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>Login Audit Log</h1>
        <p role="alert">You do not have permission to view the login audit log.</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <h1>Login Audit Log</h1>
      <p className="mt-1 mb-5 text-sm text-[var(--color-muted-text)]">
        Successful login activity for every account, with usage stats over the last 30 days.
      </p>

      {statsError && <p role="alert">{statsError}</p>}

      {stats && (
        <>
          <div className="chart-card">
            <h2>Logins over time (last 30 days)</h2>
            {stats.trend.length === 0 ? (
              <p className="member-empty-state">No logins recorded in this window.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={stats.trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="var(--rotary-blue)" name="Logins" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="chart-card">
            <h2>Most active users (last 30 days)</h2>
            {stats.most_active.length === 0 ? (
              <p className="member-empty-state">No logins recorded in this window.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(240, stats.most_active.length * 28)}>
                <BarChart data={stats.most_active} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="full_name" width={130} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="login_count" fill="var(--rotary-gold)" name="Logins" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="chart-card">
            <h2>Last login per user</h2>
            {stats.last_login.length === 0 ? (
              <p className="member-empty-state">No users found.</p>
            ) : (
              <ul className="flex list-none flex-col gap-[3px] p-0 m-0">
                {stats.last_login.map((user) => (
                  <li
                    key={user.user_id}
                    className="flex items-center justify-between rounded-[10px] px-3 py-[9px] odd:bg-white even:bg-[#f6f8fb]"
                  >
                    <span className="text-[13px] text-[var(--text-h)]">
                      {user.full_name} <span className="text-[var(--color-muted-text)]">({user.email})</span>
                    </span>
                    <span className="text-[13px] text-[var(--color-muted-text)]">
                      {formatDateTime(user.last_login_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <h2 className="mt-8 mb-3 text-sm font-bold uppercase tracking-[.06em] text-[var(--faint)]">
        Connection log
      </h2>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="pl-0.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]">
            User
          </span>
          <SingleSelectDropdown
            ariaLabel="Filter by user"
            minWidthClass="min-w-[180px]"
            value={userFilter}
            options={userOptions}
            onSelect={setUserFilter}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="connection-log-from" className="pl-0.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]">
            From
          </label>
          <input
            id="connection-log-from"
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            className="h-[38px] rounded-[8px] border border-[var(--border)] px-3 text-[13px]"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="connection-log-to" className="pl-0.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]">
            To
          </label>
          <input
            id="connection-log-to"
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            className="h-[38px] rounded-[8px] border border-[var(--border)] px-3 text-[13px]"
          />
        </div>
      </div>

      {isLoadingLogs && <p>Loading…</p>}
      {logsError && <p role="alert">{logsError}</p>}

      {!isLoadingLogs && !logsError && logs.length === 0 && (
        <p className="member-empty-state">No connection log entries match these filters.</p>
      )}

      {!isLoadingLogs && !logsError && logs.length > 0 && (
        <table className="w-full max-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--color-border-faint)]">
              {["User", "Date/Time", "IP address"].map((label) => (
                <th
                  key={label}
                  className="px-3 py-2 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-[var(--color-border-light)] last:border-b-0">
                <td className="px-3 py-[10px] text-[13px] text-[var(--text-h)]">
                  {log.user_full_name} <span className="text-[var(--color-muted-text)]">({log.user_email})</span>
                </td>
                <td className="px-3 py-[10px] text-[13px] text-[var(--color-muted-text)]">
                  {formatDateTime(log.created_at)}
                </td>
                <td className="px-3 py-[10px] text-[13px] text-[var(--color-muted-text)]">
                  {log.ip_address || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
