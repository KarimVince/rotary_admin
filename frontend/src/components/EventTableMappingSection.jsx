import { useEffect, useState } from "react";
import {
  createTableMapping,
  deleteTableMapping,
  listTableMapping,
  updateTableMapping,
} from "../api/eventSetup";

const EMPTY_ROW = { table_number: "", theme_name: "", rotary_name: "" };

export default function EventTableMappingSection({ eventId }) {
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newRow, setNewRow] = useState(EMPTY_ROW);
  const [error, setError] = useState(null);

  async function load() {
    setIsLoading(true);
    try {
      setRows(await listTableMapping(eventId));
      setError(null);
    } catch (err) {
      setError(err.detail || "Failed to load table mapping");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function handleAdd(e) {
    e.preventDefault();
    try {
      await createTableMapping(eventId, {
        table_number: Number(newRow.table_number),
        theme_name: newRow.theme_name || null,
        rotary_name: newRow.rotary_name || null,
      });
      setNewRow(EMPTY_ROW);
      setError(null);
      await load();
    } catch (err) {
      setError(err.detail || "Failed to add table");
    }
  }

  async function handleFieldChange(row, field, value) {
    setRows((current) =>
      current.map((r) => (r.id === row.id ? { ...r, [field]: value } : r)),
    );
  }

  async function handleSaveRow(row) {
    try {
      await updateTableMapping(eventId, row.id, {
        table_number: Number(row.table_number),
        theme_name: row.theme_name || null,
        rotary_name: row.rotary_name || null,
      });
      setError(null);
      await load();
    } catch (err) {
      setError(err.detail || "Failed to update table");
    }
  }

  async function handleDelete(row) {
    if (!window.confirm(`Delete table ${row.table_number}?`)) return;
    await deleteTableMapping(eventId, row.id);
    await load();
  }

  const inputClass =
    "w-full rounded-[10px] border border-[var(--color-border-medium)] px-2 py-1.5 text-[13px] text-[#0c2340]";

  return (
    <div className="rounded-2xl bg-white p-[22px] shadow-[var(--shadow-card)]">
      <span className="mb-3 block text-[13px] font-bold uppercase tracking-[0.03em] text-[#0c2340]">
        Table Mapping
      </span>
      {error && (
        <p role="alert" className="mb-2 text-[13px] text-[var(--color-tone-rose-text)]">
          {error}
        </p>
      )}
      {isLoading ? (
        <p className="text-[13px] text-[var(--color-muted-text)]">Loading…</p>
      ) : (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--color-border-faint)]">
              {["Table Number", "Theme Name", "Rotary Name", "Actions"].map((label) => (
                <th
                  key={label}
                  className="px-2 py-2 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-[var(--color-border-light)] last:border-b-0">
                <td className="px-2 py-2">
                  <input
                    aria-label={`Table number ${row.table_number}`}
                    type="number"
                    value={row.table_number}
                    onChange={(e) => handleFieldChange(row, "table_number", e.target.value)}
                    className={inputClass}
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    aria-label={`Theme name for table ${row.table_number}`}
                    value={row.theme_name || ""}
                    onChange={(e) => handleFieldChange(row, "theme_name", e.target.value)}
                    className={inputClass}
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    aria-label={`Rotary name for table ${row.table_number}`}
                    value={row.rotary_name || ""}
                    onChange={(e) => handleFieldChange(row, "rotary_name", e.target.value)}
                    className={inputClass}
                  />
                </td>
                <td className="px-2 py-2">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => handleSaveRow(row)}
                      className="bg-transparent p-0 text-[12px] font-semibold text-[var(--color-brand-blue)]"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(row)}
                      className="bg-transparent p-0 text-[12px] font-semibold text-[var(--color-tone-rose-text)]"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form onSubmit={handleAdd} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[12px] text-[var(--color-muted-text)]">
          Table Number
          <input
            id="new-table-number"
            type="number"
            value={newRow.table_number}
            onChange={(e) => setNewRow({ ...newRow, table_number: e.target.value })}
            required
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-[var(--color-muted-text)]">
          Theme Name
          <input
            id="new-table-theme"
            value={newRow.theme_name}
            onChange={(e) => setNewRow({ ...newRow, theme_name: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-[var(--color-muted-text)]">
          Rotary Name
          <input
            id="new-table-rotary-name"
            value={newRow.rotary_name}
            onChange={(e) => setNewRow({ ...newRow, rotary_name: e.target.value })}
            className={inputClass}
          />
        </label>
        <button
          type="submit"
          className="rounded-[10px] bg-[var(--color-brand-blue)] px-4 py-2 text-[13px] font-semibold text-white"
        >
          Add Table
        </button>
      </form>
    </div>
  );
}
