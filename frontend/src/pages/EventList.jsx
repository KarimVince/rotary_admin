import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { deleteEvent, listEvents } from "../api/events";
import { listMembers } from "../api/members";
import { useAccess } from "../hooks/useAccess";
import { formatCurrency, formatDate } from "../utils/formatters";
import EventFormModal from "../components/EventFormModal";
import Card from "../components/Card";

function countdownLabel(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDate = new Date(dateStr);
  const days = Math.round((eventDate - today) / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 0) return "Past";
  return `In ${days} days`;
}

function SectionHeader({ children }) {
  return (
    <h2 className="mb-3 text-[15px] font-bold uppercase tracking-[0.04em] text-[#0c2340]">{children}</h2>
  );
}

function UpcomingEventCard({ event, canWrite, onEdit, onDelete }) {
  return (
    <Card variant="default" className="flex flex-col gap-[10px] p-5">
      <div className="flex items-center justify-between">
        <span className="inline-block self-start rounded-full bg-[var(--tone-blue-bg)] px-[10px] py-[3px] text-[11px] font-bold text-[var(--color-brand-blue)]">
          {countdownLabel(event.date)}
        </span>
        {canWrite && (
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => onEdit(event)}
              className="bg-transparent p-0 text-[var(--color-brand-blue)]"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onDelete(event)}
              className="bg-transparent p-0 text-[var(--color-tone-rose-text)]"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      <span className="text-[17px] font-bold text-[#0c2340]">{event.name}</span>
      <span className="text-[13px] text-[var(--color-muted-text)]">
        {formatDate(event.date)} · {event.venue}
      </span>

      <div className="mt-1 flex gap-4 text-[13px] text-[#3c4655]">
        <span>
          <strong className="text-[#0c2340]">{event.guest_count}</strong> guests
        </span>
        <span>
          <strong className="text-[#0c2340]">{event.sponsor_count}</strong> sponsors
        </span>
      </div>

      <Link
        to={`/events/manage?event=${event.id}`}
        className="mt-[6px] rounded-lg bg-[var(--color-brand-blue-light)] p-2 text-center text-[13px] font-semibold text-[var(--color-brand-blue)]"
      >
        Manage project →
      </Link>
    </Card>
  );
}

function PastEventsTable({ events }) {
  return (
    <Card variant="default" className="p-0 overflow-hidden">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-[var(--color-border-faint)]">
            {["Name", "Date", "Venue", "Net proceeds", ""].map((label) => (
              <th
                key={label}
                className="px-5 py-3 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id} className="border-b border-[var(--color-border-light)] last:border-b-0">
              <td className="px-5 py-[14px] text-[14px] font-semibold text-[#0c2340]">{event.name}</td>
              <td className="px-5 py-[14px] text-[14px] text-[var(--color-muted-text)]">
                {formatDate(event.date)}
              </td>
              <td className="px-5 py-[14px] text-[14px] text-[var(--color-muted-text)]">{event.venue}</td>
              <td className="px-5 py-[14px] text-[14px] font-semibold text-[var(--color-tone-teal-text)]">
                {formatCurrency(event.net_proceeds)}
              </td>
              <td className="px-5 py-[14px]">
                <Link
                  to={`/events/manage?event=${event.id}`}
                  className="text-[13px] font-semibold text-[var(--color-brand-blue)]"
                >
                  View →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export default function EventList() {
  const { canRead, canWrite } = useAccess("event.list");

  const [events, setEvents] = useState([]);
  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);

  async function loadData() {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await listEvents();
      setEvents(data);
    } catch (err) {
      setLoadError(err.detail || "Failed to load events");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    loadData();
    listMembers({ status: "active" })
      .then(setMembers)
      .catch(() => setMembers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead]);

  function openCreate() {
    setEditingEvent(null);
    setIsFormOpen(true);
  }

  function openEdit(event) {
    setEditingEvent(event);
    setIsFormOpen(true);
  }

  function handleSaved() {
    setIsFormOpen(false);
    setEditingEvent(null);
    loadData();
  }

  async function handleDelete(event) {
    const confirmed = window.confirm(
      `Delete ${event.name}? All associated data (guests, items, costs, sponsors, rundown) will be permanently deleted.`,
    );
    if (!confirmed) return;
    await deleteEvent(event.id);
    loadData();
  }

  if (!canRead) {
    return (
      <div className="admin-page event-list-page">
        <h1>Events</h1>
        <p role="alert">You do not have permission to view Events.</p>
      </div>
    );
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const upcomingEvents = events
    .filter((event) => event.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));
  const pastEvents = events
    .filter((event) => event.date < todayStr)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="admin-page event-list-page">
      <div className="page-header-row">
        <h1>Events</h1>
        {canWrite && (
          <button type="button" className="btn-add-member" onClick={openCreate}>
            New Event
          </button>
        )}
      </div>

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && (
        <>
          <SectionHeader>Upcoming</SectionHeader>
          {upcomingEvents.length === 0 ? (
            <p className="member-empty-state">No upcoming events.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {upcomingEvents.map((event) => (
                <UpcomingEventCard
                  key={event.id}
                  event={event}
                  canWrite={canWrite}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}

          <div className="mt-7">
            <SectionHeader>Past events</SectionHeader>
          </div>
          {pastEvents.length === 0 ? (
            <p className="member-empty-state">No past events.</p>
          ) : (
            <PastEventsTable events={pastEvents} />
          )}
        </>
      )}

      {isFormOpen && (
        <EventFormModal
          event={editingEvent}
          members={members}
          onClose={() => setIsFormOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
