import { useEffect, useMemo, useState } from "react";
import { listBoardPositions } from "../api/boardPositions";
import { createBoardAssignment, listBoardAssignments } from "../api/boardAssignments";
import { listMembers } from "../api/members";
import Card from "../components/Card";
import { useAccess } from "../hooks/useAccess";
import { SELECT_CLASS } from "../styles/formControls";
import { currentRotaryYear, rotaryYearLabel } from "../utils/rotaryYear";

const CURRENT_YEAR = currentRotaryYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, index) => CURRENT_YEAR - index);

function latestAssignmentFor(assignments, positionId) {
  const forPosition = assignments.filter((a) => a.board_position_id === positionId);
  if (forPosition.length === 0) return null;
  const active = forPosition.find((a) => a.end_date === null);
  if (active) return active;
  return [...forPosition].sort((a, b) => (a.start_date < b.start_date ? 1 : -1))[0];
}

export default function BoardMembers() {
  const { canRead } = useAccess("board.members");
  const { canWrite: canManage } = useAccess("board.members");

  const [year, setYear] = useState(CURRENT_YEAR);
  const [positions, setPositions] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [assigningPositionId, setAssigningPositionId] = useState(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const isCurrentTerm = year === CURRENT_YEAR;
  const canAssign = canManage && isCurrentTerm;

  const boardPositions = useMemo(
    () => positions.filter((position) => position.at_the_board),
    [positions],
  );
  const nonBoardPositions = useMemo(
    () => positions.filter((position) => !position.at_the_board),
    [positions],
  );

  async function loadAll() {
    setIsLoading(true);
    try {
      const [positionsData, assignmentsData] = await Promise.all([
        listBoardPositions(),
        listBoardAssignments(year),
      ]);
      setPositions(positionsData);
      setAssignments(assignmentsData);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.detail || "Failed to load board members");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, canRead]);

  useEffect(() => {
    if (canManage && members.length === 0) {
      listMembers({ status: "active" })
        .then(setMembers)
        .catch(() => {
          // Non-fatal — the assign form just shows an empty member list.
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  const filteredMembers = useMemo(() => {
    const term = memberSearch.trim().toLowerCase();
    if (!term) return [];
    return members
      .filter((member) => `${member.first_name} ${member.last_name}`.toLowerCase().includes(term))
      .slice(0, 8);
  }, [memberSearch, members]);

  const memberAlreadyHoldsOtherPosition = useMemo(() => {
    if (!selectedMember) return null;
    const conflict = assignments.find(
      (a) =>
        a.end_date === null &&
        a.member_id === selectedMember.id &&
        a.board_position_id !== assigningPositionId,
    );
    return conflict ? conflict.board_position?.name : null;
  }, [assignments, selectedMember, assigningPositionId]);

  function openAssignForm(positionId) {
    setAssigningPositionId(positionId);
    setMemberSearch("");
    setSelectedMember(null);
    setSaveError(null);
  }

  function cancelAssign() {
    setAssigningPositionId(null);
    setMemberSearch("");
    setSelectedMember(null);
    setSaveError(null);
  }

  function handleSelectMember(member) {
    setSelectedMember(member);
    setMemberSearch(`${member.first_name} ${member.last_name}`);
  }

  async function handleSubmitAssign(event) {
    event.preventDefault();
    if (!selectedMember) return;
    setSaveError(null);
    setIsSaving(true);
    try {
      await createBoardAssignment({
        board_position_id: assigningPositionId,
        member_id: selectedMember.id,
      });
      cancelAssign();
      await loadAll();
    } catch (err) {
      setSaveError(err.detail || "Failed to assign member");
    } finally {
      setIsSaving(false);
    }
  }

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>Board members</h1>
        <p role="alert">You do not have permission to view board members.</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <h1>Board members</h1>
      <p className="mt-1 mb-5 text-sm text-[var(--color-muted-text)]">
        Link board and non-board positions to the members holding them this term.
      </p>

      <div className="mb-5">
        <label htmlFor="board-members-year" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
          Term
        </label>
        <select
          id="board-members-year"
          value={year}
          onChange={(event) => setYear(Number(event.target.value))}
          className={`${SELECT_CLASS} min-w-[140px]`}
        >
          {YEAR_OPTIONS.map((y) => (
            <option key={y} value={y}>
              {rotaryYearLabel(y)}
            </option>
          ))}
        </select>
      </div>

      {!isCurrentTerm && <p className="text-sm text-[var(--color-muted-text)] mb-4">Viewing a past term — read-only.</p>}
      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && (
        <>
          <h2 className="text-[15px] font-bold text-[var(--color-brand-blue-dark)] mb-2">Board Members</h2>
          <Card variant="default" className="!p-0 !rounded-2xl overflow-hidden mb-6">
            <BoardPositionTable
              positions={boardPositions}
              assignments={assignments}
              canAssign={canAssign}
              onAssign={openAssignForm}
            />
          </Card>

          <h2 className="text-[15px] font-bold text-[var(--color-brand-blue-dark)] mb-2">Non-Board Members</h2>
          <Card variant="default" className="!p-0 !rounded-2xl overflow-hidden">
            <BoardPositionTable
              positions={nonBoardPositions}
              assignments={assignments}
              canAssign={canAssign}
              onAssign={openAssignForm}
            />
          </Card>
        </>
      )}

      {assigningPositionId && (
        <form onSubmit={handleSubmitAssign} className="mt-6 max-w-[420px]">
          <Card variant="default" className="!p-6 !rounded-2xl relative">
            <h2 className="text-base font-bold text-[var(--color-brand-blue-dark)] mb-3">Assign member</h2>
            <label htmlFor="board-member-search" className="block text-xs font-semibold text-[var(--color-muted-text)] mb-1.5">
              Member
            </label>
            <input
              id="board-member-search"
              type="text"
              autoComplete="off"
              value={memberSearch}
              onChange={(event) => {
                setMemberSearch(event.target.value);
                setSelectedMember(null);
              }}
              required
              className="w-full border border-[var(--color-card-border)] rounded-lg px-3 py-2 text-sm"
            />
            {filteredMembers.length > 0 && !selectedMember && (
              <ul className="mt-1.5 border border-[var(--color-card-border)] rounded-lg overflow-hidden bg-white shadow-[0_12px_32px_rgba(0,0,0,0.12)]">
                {filteredMembers.map((member) => (
                  <li key={member.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectMember(member)}
                      className="w-full text-left border-none bg-transparent px-3 py-2 text-sm cursor-pointer hover:bg-[var(--color-brand-blue-light)]"
                    >
                      {member.first_name} {member.last_name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {memberAlreadyHoldsOtherPosition && (
              <p className="mt-2 text-sm text-[var(--color-muted-text)]">
                Note: this member already holds {memberAlreadyHoldsOtherPosition} this term. They
                can still be assigned here.
              </p>
            )}
            {saveError && <p role="alert">{saveError}</p>}
            <div className="flex gap-3 mt-4">
              <button
                type="submit"
                disabled={isSaving || !selectedMember}
                className="rounded-full px-6 py-2.5 text-[14.5px] font-semibold text-white bg-[var(--color-brand-blue)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSaving ? "Saving…" : "Confirm assignment"}
              </button>
              <button
                type="button"
                onClick={cancelAssign}
                className="rounded-full px-6 py-2.5 text-[14.5px] font-semibold text-[var(--color-muted-text-strong)] bg-[var(--color-border-light)] hover:bg-[var(--color-card-border)] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </Card>
        </form>
      )}
    </div>
  );
}

function BoardPositionTable({ positions, assignments, canAssign, onAssign }) {
  if (positions.length === 0) {
    return <p className="px-5 py-4 text-sm text-[var(--color-muted-text)]">None.</p>;
  }
  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="bg-[var(--color-border-light)]">
          <th className="text-left px-5 py-3 text-xs font-bold text-[var(--color-muted-text)] uppercase tracking-wide">
            Position
          </th>
          <th className="text-left px-5 py-3 text-xs font-bold text-[var(--color-muted-text)] uppercase tracking-wide">
            Member
          </th>
          <th className="text-left px-5 py-3 text-xs font-bold text-[var(--color-muted-text)] uppercase tracking-wide">
            Start date
          </th>
          {canAssign && <th className="px-5 py-3" />}
        </tr>
      </thead>
      <tbody>
        {positions.map((position) => {
          const assignment = latestAssignmentFor(assignments, position.id);
          const isVacant = !assignment || assignment.end_date !== null;
          return (
            <tr key={position.id} className="border-t border-[var(--color-border-light)]">
              <td className="px-5 py-3 text-sm font-semibold text-[#0c2340]">{position.name}</td>
              <td className="px-5 py-3 text-sm">
                {isVacant ? (
                  <span className="inline-block rounded-full px-2.5 py-1 text-xs font-bold bg-[var(--color-border-light)] text-[var(--color-muted-text)]">
                    — Vacant —
                  </span>
                ) : (
                  `${assignment.member.first_name} ${assignment.member.last_name}`
                )}
              </td>
              <td className="px-5 py-3 text-sm text-[var(--color-muted-text)]">
                {isVacant ? "—" : assignment.start_date}
              </td>
              {canAssign && (
                <td className="px-5 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onAssign(position.id)}
                    className={
                      isVacant
                        ? "rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-[var(--color-brand-blue)] border-none cursor-pointer"
                        : "rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-blue)] bg-white border border-[var(--color-brand-blue)] cursor-pointer"
                    }
                  >
                    {isVacant ? "Assign" : "Change"}
                  </button>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
