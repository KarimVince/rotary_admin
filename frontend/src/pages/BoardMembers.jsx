import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { listBoardPositions } from "../api/boardPositions";
import {
  createBoardAssignment,
  generateBoardMembersReport,
  listBoardAssignments,
} from "../api/boardAssignments";
import { listMembers } from "../api/members";
import Card from "../components/Card";
import SingleSelectDropdown from "../components/SingleSelectDropdown";
import { useAccess } from "../hooks/useAccess";
import { useRotaryYears } from "../hooks/useRotaryYears";
import { SELECT_CLASS } from "../styles/formControls";
import { rotaryYearLabel } from "../utils/rotaryYear";

const SESSION_KEY_REPORT_USE_TEMPLATE = "boardMembers.report.useTemplate";
const SESSION_KEY_INCLUDE_NON_BOARD = "boardMembers.report.includeNonBoard";

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

  const { yearOptions, currentYear, selectedYear: year, setSelectedYear: setYear } = useRotaryYears();
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

  const [reportFormat, setReportFormat] = useState("pdf");
  const [useTemplate, setUseTemplate] = useState(
    () => sessionStorage.getItem(SESSION_KEY_REPORT_USE_TEMPLATE) === "true",
  );
  const [includeNonBoard, setIncludeNonBoard] = useState(
    () => sessionStorage.getItem(SESSION_KEY_INCLUDE_NON_BOARD) === "true",
  );
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState(null);

  function handleUseTemplateChange(checked) {
    setUseTemplate(checked);
    sessionStorage.setItem(SESSION_KEY_REPORT_USE_TEMPLATE, String(checked));
  }

  function handleIncludeNonBoardChange(checked) {
    setIncludeNonBoard(checked);
    sessionStorage.setItem(SESSION_KEY_INCLUDE_NON_BOARD, String(checked));
  }

  async function handleGenerateReport() {
    setIsGeneratingReport(true);
    setReportError(null);
    try {
      const { blob, filename } = await generateBoardMembersReport(reportFormat, {
        year,
        useTemplate: useTemplate && reportFormat === "pptx",
        includeNonBoard,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setReportError(err.detail || "Failed to generate report");
    } finally {
      setIsGeneratingReport(false);
    }
  }

  const isCurrentTerm = year === currentYear;
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
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {rotaryYearLabel(y)}
            </option>
          ))}
        </select>
      </div>

      {/* Board Members report — same PDF/PPTX card-based design and chrome
          toggle as the NGO Statistics report (see DonationsStatistics.jsx). */}
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="pl-0.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]">
            Format
          </span>
          <SingleSelectDropdown
            ariaLabel="Format"
            minWidthClass="min-w-[170px]"
            disabled={isGeneratingReport}
            value={reportFormat}
            options={[
              { value: "pdf", label: "PDF" },
              { value: "pptx", label: "PowerPoint (PPTX)" },
            ]}
            onSelect={setReportFormat}
          />
        </div>

        <label
          htmlFor="board-report-use-template"
          className="flex h-[38px] items-center gap-2 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]"
          title={
            reportFormat !== "pptx"
              ? "The district template only applies to PowerPoint (PPTX) reports"
              : undefined
          }
        >
          <input
            id="board-report-use-template"
            type="checkbox"
            checked={useTemplate}
            onChange={(event) => handleUseTemplateChange(event.target.checked)}
            disabled={isGeneratingReport || reportFormat !== "pptx"}
          />
          Use district template
        </label>

        <label
          htmlFor="board-report-include-non-board"
          className="flex h-[38px] items-center gap-2 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]"
        >
          <input
            id="board-report-include-non-board"
            type="checkbox"
            checked={includeNonBoard}
            onChange={(event) => handleIncludeNonBoardChange(event.target.checked)}
            disabled={isGeneratingReport}
          />
          Include committee members
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="pl-0.5 text-[11px]">&nbsp;</span>
          <button
            type="button"
            onClick={handleGenerateReport}
            disabled={isGeneratingReport}
            className="inline-flex h-[38px] items-center gap-2 rounded-[8px] border border-[var(--border)] bg-transparent px-4 text-[13px] font-semibold text-[var(--ink-2)] hover:bg-[var(--bg-alt)] disabled:opacity-50"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            {isGeneratingReport ? "Generating…" : "Generate Report"}
          </button>
        </div>
        {reportError && (
          <p role="alert" className="w-full text-[13px] text-[var(--low)]">
            {reportError}
          </p>
        )}
      </div>

      {!isCurrentTerm && <p className="text-sm text-[var(--color-muted-text)] mb-4">Viewing a past term — read-only.</p>}
      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && (
        <>
          <h2 className="text-[15px] font-bold text-[var(--color-brand-blue-dark)] mb-3">Board Members</h2>
          {/* Card grid — highlights President & President Elect */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
            {boardPositions.map((position) => (
              <BoardPositionCard
                key={position.id}
                position={position}
                assignment={latestAssignmentFor(assignments, position.id)}
                canAssign={canAssign}
                onAssign={openAssignForm}
              />
            ))}
          </div>
          {/* Table — for assigning / historical detail */}
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

/** Derive the top-band style for a board position.
 *  - "President" (exact) → gold
 *  - "President Elect" / "President-Elect" → rotary blue
 *  - anything else → light-blue empty bar
 */
function _positionBand(name) {
  const n = name.trim().toLowerCase();
  if (n === "president elect" || n === "president-elect") {
    return { label: "President Elect", className: "bg-[var(--rotary-blue)] text-white" };
  }
  if (n === "president") {
    return { label: "★ President", className: "bg-[var(--rotary-gold)] text-white" };
  }
  return null; // light-blue placeholder
}

function BoardPositionCard({ position, assignment, canAssign, onAssign }) {
  const isVacant = !assignment || assignment.end_date !== null;
  const band = _positionBand(position.name);
  const BAND_BASE = "w-full py-[5px] px-2 text-[10.5px] font-bold uppercase tracking-widest text-center";

  return (
    <Card
      variant="default"
      className="flex flex-col !p-0 overflow-hidden"
    >
      {/* Top band */}
      {band ? (
        <div className={`${BAND_BASE} ${band.className}`}>{band.label}</div>
      ) : (
        <div className={`${BAND_BASE} bg-[#dbeafe] text-[#1e40af]`} aria-hidden="true">&nbsp;</div>
      )}

      {/* Card body */}
      <div className="flex flex-col gap-1 p-3 flex-1">
        <span className="text-[12px] font-bold text-[var(--ink)] leading-snug">
          {position.name}
        </span>
        {isVacant ? (
          <span className="text-[11.5px] text-[var(--faint)] italic">Vacant</span>
        ) : (
          <span className="text-[12px] text-[var(--ink-2)]">
            {assignment.member.first_name} {assignment.member.last_name}
          </span>
        )}
        {canAssign && (
          <button
            type="button"
            onClick={() => onAssign(position.id)}
            className="mt-1 self-start rounded-md px-2 py-1 text-[10.5px] font-semibold border cursor-pointer"
            style={isVacant
              ? { background: "var(--rotary-blue)", color: "#fff", borderColor: "var(--rotary-blue)" }
              : { background: "transparent", color: "var(--rotary-blue)", borderColor: "var(--rotary-blue)" }
            }
          >
            {isVacant ? "Assign" : "Change"}
          </button>
        )}
      </div>
    </Card>
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
              <td className="px-5 py-3 text-sm font-semibold text-[var(--text-h)]">{position.name}</td>
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
