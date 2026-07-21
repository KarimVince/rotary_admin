import { useState } from "react";
import { AVATAR_TONES } from "../utils/avatar";

function Avatar({ initials, index }) {
  const tone = AVATAR_TONES[index % AVATAR_TONES.length];
  return (
    <div
      className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${tone.bgClass} ${tone.textClass}`}
    >
      {initials}
    </div>
  );
}

// Chip row + searchable checkbox picker for choosing email recipients.
// `people` items: { id, name, initials, sublabel }. `quickFilters` (optional):
// { key, label, predicate(person) }[] — rendered as filter chips inside the
// picker panel so a whole group (e.g. "Active members") can be bulk-selected
// via "Select all" without a separate recipient mode.
export default function RecipientPicker({ people, selectedIds, onChange, quickFilters = [], label }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeFilterKey, setActiveFilterKey] = useState(null);

  const selectedSet = new Set(selectedIds);
  const selectedPeople = people.filter((person) => selectedSet.has(person.id));

  const activeFilter = quickFilters.find((filter) => filter.key === activeFilterKey);
  const q = search.trim().toLowerCase();
  const filteredPeople = people.filter((person) => {
    if (activeFilter && !activeFilter.predicate(person)) return false;
    if (q && !person.name.toLowerCase().includes(q)) return false;
    return true;
  });

  const filteredIds = filteredPeople.map((person) => person.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedSet.has(id));

  const allIds = people.map((person) => person.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedSet.has(id));

  function toggleSelectAllPeople() {
    onChange(allSelected ? [] : allIds);
  }

  function toggle(id) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  function remove(id) {
    onChange(selectedIds.filter((x) => x !== id));
  }

  function toggleSelectAll() {
    if (allFilteredSelected) {
      onChange(selectedIds.filter((id) => !filteredIds.includes(id)));
    } else {
      onChange(Array.from(new Set([...selectedIds, ...filteredIds])));
    }
  }

  return (
    <div className="relative">
      <div className="text-[13px] font-semibold text-[var(--color-muted-text)] mb-2.5">{label}</div>
      <div className="flex flex-wrap gap-2 items-center">
        {selectedPeople.map((person, index) => (
          <div
            key={person.id}
            className="flex items-center gap-2 bg-[var(--color-brand-blue-chip)] rounded-full pl-1 pr-1.5 py-1"
          >
            <Avatar initials={person.initials} index={index} />
            <span className="text-sm text-[var(--color-brand-blue-dark)]">{person.name}</span>
            <button
              type="button"
              onClick={() => remove(person.id)}
              aria-label={`Remove ${person.name}`}
              className="border-none bg-transparent text-[var(--color-muted-text)] cursor-pointer text-base leading-none px-0.5 hover:text-[#b23b3b]"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setPickerOpen((open) => !open)}
          className="border border-dashed border-[var(--color-muted-text)] bg-transparent rounded-full px-3.5 py-1.5 text-sm text-[var(--color-muted-text)] cursor-pointer hover:border-[var(--color-brand-blue)] hover:text-[var(--color-brand-blue)]"
        >
          + Add recipients
        </button>
        {people.length > 0 && (
          <button
            type="button"
            onClick={toggleSelectAllPeople}
            className="border-none bg-transparent rounded-full px-2 py-1.5 text-sm font-semibold text-[var(--color-brand-blue)] cursor-pointer hover:underline"
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
        )}
      </div>
      <div className="mt-2 text-[13px] text-[var(--color-muted-text)]">
        {selectedPeople.length} recipient{selectedPeople.length === 1 ? "" : "s"} selected
      </div>

      {pickerOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-[var(--color-card-border)] rounded-2xl shadow-[0_12px_32px_rgba(0,0,0,0.12)] z-10 overflow-hidden">
          <div className="p-3 border-b border-[var(--color-border-light)] flex flex-wrap gap-2 items-center">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search…"
              className="flex-1 min-w-[140px] border border-[var(--color-card-border)] rounded-lg px-2.5 py-2 text-sm"
            />
            {quickFilters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setActiveFilterKey((current) => (current === filter.key ? null : filter.key))}
                className={`border-none rounded-lg px-3 py-2 text-[13px] cursor-pointer whitespace-nowrap ${
                  activeFilterKey === filter.key
                    ? "bg-[var(--color-brand-blue)] text-white"
                    : "bg-[var(--color-brand-blue-light)] text-[var(--color-brand-blue-dark)]"
                }`}
              >
                {filter.label}
              </button>
            ))}
            <button
              type="button"
              onClick={toggleSelectAll}
              className="border-none bg-[var(--color-brand-blue-light)] rounded-lg px-3 py-2 text-[13px] cursor-pointer whitespace-nowrap"
            >
              {allFilteredSelected ? "Clear shown" : "Select shown"}
            </button>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="border-none bg-[var(--color-brand-blue-light)] rounded-lg px-3 py-2 text-[13px] cursor-pointer"
            >
              Done
            </button>
          </div>
          <div className="max-h-[260px] overflow-y-auto p-1.5">
            {filteredPeople.length === 0 && (
              <div className="px-3 py-4 text-sm text-[var(--color-muted-text)]">No matches</div>
            )}
            {filteredPeople.map((person, index) => {
              const checked = selectedSet.has(person.id);
              return (
                <div
                  key={person.id}
                  role="checkbox"
                  aria-checked={checked}
                  aria-label={person.name}
                  tabIndex={0}
                  onClick={() => toggle(person.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggle(person.id);
                    }
                  }}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer hover:bg-[var(--color-brand-blue-light)]"
                >
                  <div
                    className={`w-[18px] h-[18px] rounded-[5px] border-[1.5px] flex items-center justify-center text-white text-xs shrink-0 ${
                      checked
                        ? "bg-[var(--color-brand-blue)] border-[var(--color-brand-blue)]"
                        : "bg-transparent border-[var(--color-muted-text)]"
                    }`}
                  >
                    {checked ? "✓" : ""}
                  </div>
                  <Avatar initials={person.initials} index={index} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-[var(--color-brand-blue-dark)] truncate">{person.name}</div>
                    {person.sublabel && (
                      <div className="text-xs text-[var(--color-muted-text)] truncate">{person.sublabel}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
