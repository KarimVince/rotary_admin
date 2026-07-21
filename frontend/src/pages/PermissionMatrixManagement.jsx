import { useEffect, useState } from "react";
import { listBoardPositions } from "../api/boardPositions";
import {
  getPermissionMatrix,
  listAppFunctions,
  upsertPermissionMatrixCell,
} from "../api/boardPermissions";
import Card from "../components/Card";

const ACCESS_LEVELS = [
  { value: "no_access", label: "No Access", code: "NA" },
  { value: "read", label: "Read", code: "R" },
  { value: "write", label: "Write", code: "W" },
];

const ACCESS_LEVEL_ORDER = { no_access: 0, read: 1, write: 2 };

const DEFAULT_USER_COLUMN = { id: null, name: "Default User" };

function cellKey(appFunctionId, boardPositionId) {
  return `${appFunctionId}::${boardPositionId ?? "default"}`;
}

function buildTree(appFunctions) {
  const menus = appFunctions
    .filter((fn) => !fn.parent_id)
    .slice()
    .sort((a, b) => a.display_order - b.display_order);
  return menus.map((menu) => ({
    menu,
    submenus: appFunctions
      .filter((fn) => fn.parent_id === menu.id)
      .slice()
      .sort((a, b) => a.display_order - b.display_order),
  }));
}

export default function PermissionMatrixManagement() {
  const [appFunctions, setAppFunctions] = useState([]);
  const [boardPositions, setBoardPositions] = useState([]);
  const [matrixEntries, setMatrixEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [savingKey, setSavingKey] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [cascadeNote, setCascadeNote] = useState(null);

  async function loadAll() {
    setIsLoading(true);
    try {
      const [functions, positions, matrix] = await Promise.all([
        listAppFunctions(),
        listBoardPositions(),
        getPermissionMatrix(),
      ]);
      setAppFunctions(functions);
      setBoardPositions(positions);
      setMatrixEntries(matrix);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.detail || "Failed to load permission matrix");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  function accessLevelFor(appFunctionId, boardPositionId) {
    const entry = matrixEntries.find(
      (item) =>
        item.app_function_id === appFunctionId && item.board_position_id === boardPositionId,
    );
    return entry ? entry.access_level : "no_access";
  }

  async function handleCellChange(appFunction, boardPositionId, accessLevel) {
    const key = cellKey(appFunction.id, boardPositionId);
    setSavingKey(key);
    setSaveError(null);
    setCascadeNote(null);
    try {
      const { entry, cascaded } = await upsertPermissionMatrixCell({
        app_function_id: appFunction.id,
        board_position_id: boardPositionId,
        access_level: accessLevel,
      });
      setMatrixEntries((current) => {
        let next = current.filter(
          (item) =>
            !(item.app_function_id === entry.app_function_id
              && item.board_position_id === entry.board_position_id),
        );
        next = [...next, entry];
        for (const cascadedEntry of cascaded || []) {
          next = next.filter(
            (item) =>
              !(item.app_function_id === cascadedEntry.app_function_id
                && item.board_position_id === cascadedEntry.board_position_id),
          );
          next = [...next, cascadedEntry];
        }
        return next;
      });

      if (cascaded && cascaded.length > 0) {
        const columnName = entry.board_position ? entry.board_position.name : "Default User";
        const names = cascaded.map((item) => item.app_function.label).join(", ");
        setCascadeNote(
          `Lowering ${appFunction.label} to ${accessLevel.replace("_", " ")} for ${columnName} `
            + `also downgraded ${cascaded.length} sub-item${cascaded.length > 1 ? "s" : ""}: ${names}.`,
        );
      }
    } catch (err) {
      setSaveError(err.detail || "Failed to save permission");
    } finally {
      setSavingKey(null);
    }
  }

  const columns = [...boardPositions, DEFAULT_USER_COLUMN];
  const tree = buildTree(appFunctions);

  return (
    <div className="admin-page admin-page-wide">
      <h1>Permission matrix</h1>
      <p className="mt-1 mb-3 text-sm text-[var(--color-muted-text)]">
        Choose the access level each position has to every menu item. A sub-item can never be
        set above its menu's level.
      </p>
      <div className="flex gap-4 mb-4 text-xs text-[var(--color-muted-text)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block rounded-full px-2.5 py-1 text-xs font-bold bg-[var(--tone-blue-bg)] text-[var(--color-brand-blue)]">
            NA
          </span>
          No access
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block rounded-full px-2.5 py-1 text-xs font-bold bg-[var(--tone-amber-bg)] text-[var(--color-tone-amber-text)]">
            R
          </span>
          Read only
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block rounded-full px-2.5 py-1 text-xs font-bold bg-[var(--tone-rose-bg)] text-[var(--color-tone-rose-text)]">
            W
          </span>
          Read &amp; write
        </span>
      </div>

      {saveError && <p role="alert">{saveError}</p>}
      {cascadeNote && <p className="matrix-cascade-note">{cascadeNote}</p>}
      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}
      {!isLoading && !loadError && (
        <Card variant="default" className="!p-0 !rounded-2xl permission-matrix-wrap">
          <table className="admin-table permission-matrix">
            <thead>
              <tr>
                <th className="matrix-row-header">App function</th>
                {columns.map((column) => (
                  <th key={column.id ?? "default"} className="matrix-col-header">
                    {column.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tree.map(({ menu, submenus }) => (
                <MenuBlock
                  key={menu.id}
                  menu={menu}
                  submenus={submenus}
                  columns={columns}
                  accessLevelFor={accessLevelFor}
                  onCellChange={handleCellChange}
                  savingKey={savingKey}
                />
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function MenuBlock({ menu, submenus, columns, accessLevelFor, onCellChange, savingKey }) {
  return (
    <>
      <MatrixRow
        appFunction={menu}
        rowClassName="menu-row"
        columns={columns}
        accessLevelFor={accessLevelFor}
        maxLevelFor={() => "write"}
        onCellChange={onCellChange}
        savingKey={savingKey}
      />
      {submenus.map((submenu) => (
        <MatrixRow
          key={submenu.id}
          appFunction={submenu}
          rowClassName="submenu-row"
          columns={columns}
          accessLevelFor={accessLevelFor}
          maxLevelFor={(columnId) => accessLevelFor(menu.id, columnId)}
          onCellChange={onCellChange}
          savingKey={savingKey}
        />
      ))}
    </>
  );
}

function MatrixRow({
  appFunction,
  rowClassName,
  columns,
  accessLevelFor,
  maxLevelFor,
  onCellChange,
  savingKey,
}) {
  return (
    <tr className={rowClassName}>
      <td className="matrix-row-header">{appFunction.label}</td>
      {columns.map((column) => {
        const key = cellKey(appFunction.id, column.id);
        const currentLevel = accessLevelFor(appFunction.id, column.id);
        const maxLevel = maxLevelFor(column.id);
        const currentLabel = ACCESS_LEVELS.find((level) => level.value === currentLevel)?.label;
        return (
          <td key={key}>
            {/* Story 12.13: closed select shows only the short code (NA/R/W);
                the full label is a hover tooltip via `title`, not inline text. */}
            <select
              className={`access-${currentLevel}`}
              aria-label={`${appFunction.label} — ${column.name}`}
              title={currentLabel}
              value={currentLevel}
              disabled={savingKey === key}
              onChange={(event) => onCellChange(appFunction, column.id, event.target.value)}
            >
              {ACCESS_LEVELS.map((level) => (
                <option
                  key={level.value}
                  value={level.value}
                  disabled={ACCESS_LEVEL_ORDER[level.value] > ACCESS_LEVEL_ORDER[maxLevel]}
                  title={level.label}
                >
                  {level.code}
                </option>
              ))}
            </select>
          </td>
        );
      })}
    </tr>
  );
}
