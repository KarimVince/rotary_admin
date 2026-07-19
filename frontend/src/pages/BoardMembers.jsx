import { useEffect, useMemo, useState } from "react";
import { listBoardPositions } from "../api/boardPositions";
import { createBoardAssignment, listBoardAssignments } from "../api/boardAssignments";
import { listMembers } from "../api/members";
import { useAccess } from "../hooks/useAccess";
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

      <div className="email-controls-row">
        <div>
          <label htmlFor="board-members-year">Term</label>
          <select
            id="board-members-year"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {rotaryYearLabel(y)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!isCurrentTerm && <p>Viewing a past term — read-only.</p>}
      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && (
        <>
          <h2>Board Members</h2>
          <BoardPositionTable
            positions={boardPositions}
            assignments={assignments}
            canAssign={canAssign}
            onAssign={openAssignForm}
          />

          <h2>Non-Board Members</h2>
          <BoardPositionTable
            positions={nonBoardPositions}
            assignments={assignments}
            canAssign={canAssign}
            onAssign={openAssignForm}
          />
        </>
      )}

      {assigningPositionId && (
        <form className="admin-form" onSubmit={handleSubmitAssign}>
          <h2>Assign member</h2>
          <label htmlFor="board-member-search">Member</label>
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
          />
          {filteredMembers.length > 0 && !selectedMember && (
            <ul className="board-member-suggestions">
              {filteredMembers.map((member) => (
                <li key={member.id}>
                  <button type="button" onClick={() => handleSelectMember(member)}>
                    {member.first_name} {member.last_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {memberAlreadyHoldsOtherPosition && (
            <p>
              Note: this member already holds {memberAlreadyHoldsOtherPosition} this term. They
              can still be assigned here.
            </p>
          )}
          {saveError && <p role="alert">{saveError}</p>}
          <button type="submit" disabled={isSaving || !selectedMember}>
            {isSaving ? "Saving…" : "Confirm assignment"}
          </button>
          <button type="button" onClick={cancelAssign}>
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}

function BoardPositionTable({ positions, assignments, canAssign, onAssign }) {
  if (positions.length === 0) {
    return <p>None.</p>;
  }
  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th>Position</th>
          <th>Member</th>
          <th>Start date</th>
          {canAssign && <th></th>}
        </tr>
      </thead>
      <tbody>
        {positions.map((position) => {
          const assignment = latestAssignmentFor(assignments, position.id);
          const isVacant = !assignment || assignment.end_date !== null;
          return (
            <tr key={position.id}>
              <td>{position.name}</td>
              <td>
                {isVacant
                  ? "— Vacant —"
                  : `${assignment.member.first_name} ${assignment.member.last_name}`}
              </td>
              <td>{isVacant ? "—" : assignment.start_date}</td>
              {canAssign && (
                <td>
                  <button type="button" onClick={() => onAssign(position.id)}>
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
