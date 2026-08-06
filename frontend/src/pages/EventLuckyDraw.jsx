import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  FileDown,
  Filter,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { getEventSetup } from "../api/eventSetup";
import {
  deleteEventItem,
  downloadAuctionReceiptsReport,
  downloadLuckyDrawResultsReport,
  downloadProgrammeReport,
  getLuckyDrawConfig,
  listEventItems,
  saveLuckyDrawConfig,
} from "../api/eventItems";
import { listMembers } from "../api/members";
import { useAccess } from "../hooks/useAccess";
import { useTheme } from "../context/ThemeContext";
import { formatCurrency } from "../utils/formatters";
import EventItemFormModal from "../components/EventItemFormModal";
import MultiSelectDropdown from "../components/MultiSelectDropdown";
import Card from "../components/Card";

const TYPE_LABEL = {
  auction: "Auction",
  lucky_draw_on_stage: "Lucky Draw On Stage",
  lucky_draw: "Lucky Draw",
};

const TYPE_CHIP = {
  auction: { bg: "var(--tone-lavender-bg)", color: "var(--color-tone-lavender-text)" },
  lucky_draw_on_stage: { bg: "var(--tone-blue-bg)", color: "var(--color-brand-blue)" },
  lucky_draw: { bg: "var(--tone-blue-bg)", color: "var(--color-brand-blue)" },
};

const TYPE_CHIP_MINIMAL = {
  auction: { bg: "var(--gold-soft)", color: "var(--gold-ink)" },
  lucky_draw_on_stage: { bg: "var(--accent-soft)", color: "var(--accent-ink)" },
  lucky_draw: { bg: "var(--accent-soft)", color: "var(--accent-ink)" },
};

const STATUS_LABEL = { received: "Received", not_received: "Not Received" };

const TILE_TONES = [
  { bg: "var(--tone-amber-bg)", color: "var(--color-tone-amber-text)" },
  { bg: "var(--tone-blue-bg)", color: "var(--color-brand-blue)" },
  { bg: "var(--tone-lavender-bg)", color: "var(--color-tone-lavender-text)" },
  { bg: "var(--tone-teal-bg)", color: "var(--color-tone-teal-text)" },
  { bg: "var(--tone-rose-bg)", color: "var(--color-tone-rose-text)" },
];

const TILE_TONES_MINIMAL = [
  { bg: "var(--gold-soft)", color: "var(--gold-ink)" },
  { bg: "var(--accent-soft)", color: "var(--accent-ink)" },
  { bg: "var(--ok-bg)", color: "var(--ok)" },
  { bg: "var(--low-bg)", color: "var(--low)" },
  { bg: "var(--warn-bg)", color: "var(--warn)" },
];

const SORTABLE_COLUMNS = [
  { key: "lot_ref", label: "Lot Ref" },
  { key: "name", label: "Name" },
  { key: "value_hkd", label: "Value HKD" },
  { key: "donor_sponsor", label: "Donor / Sponsor" },
  { key: "contact_rotary_name", label: "Contact Rotary" },
  { key: "item_type", label: "Type" },
  { key: "ad_page", label: "Ad Page" },
  { key: "status", label: "Status" },
  { key: "value_sold", label: "Value Sold" },
];

function itemSortValue(item, key) {
  switch (key) {
    case "item_type":
      return TYPE_LABEL[item.item_type] || "";
    case "status":
      return STATUS_LABEL[item.status] || "";
    case "ad_page":
      return item.ad_page ? 1 : 0;
    case "value_hkd":
    case "value_sold":
      return item[key] ?? -1;
    default:
      return item[key] || "";
  }
}

// 2026-08-06: minimal branch now matches Dashboard's stat-card shape
// exactly (Card variant="stat-*", value-first <span>, label <span>, inside
// a `.stat-duo-grid` parent for the position-based blue/gold alternation +
// compact type-scale) instead of its own plain-div 5-tone cycling palette.
// Classic keeps its original look untouched.
function StatTile({ bg, color, value, label, isMinimal }) {
  if (isMinimal) {
    return (
      <Card variant="stat-blue" className="flex flex-col">
        <span className="text-3xl font-bold">{value}</span>
        <span className="mt-2 text-sm">{label}</span>
      </Card>
    );
  }
  return (
    <div className="rounded-2xl p-[14px_18px]" style={{ background: bg }}>
      <span className="block text-[20px] font-bold" style={{ color }}>
        {value}
      </span>
      <span className="text-[12px] text-[var(--text)]">{label}</span>
    </div>
  );
}

function TableWrapper({ isMinimal, children }) {
  if (isMinimal) {
    return <div className="overflow-hidden">{children}</div>;
  }
  return (
    <Card variant="default" className="p-0 overflow-hidden">
      {children}
    </Card>
  );
}

export default function EventLuckyDraw({ event: selectedEvent }) {
  const { isMinimal } = useTheme();
  const { canRead, canWrite } = useAccess("event.auction");

  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [items, setItems] = useState([]);
  const [config, setConfig] = useState({ tickets_sold: 0, other_donation: 0 });
  const [setup, setSetup] = useState(null);
  const [isLoadingItemData, setIsLoadingItemData] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const [generatingReport, setGeneratingReport] = useState(null);
  const [reportErrors, setReportErrors] = useState({});

  const [typeFilters, setTypeFilters] = useState([]);
  const [statusFilters, setStatusFilters] = useState([]);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function toggleFilter(setFilters, value) {
    setFilters((current) =>
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    );
  }

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    listMembers({ status: "active" })
      .then(setMembers)
      .catch((err) => setLoadError(err.detail || "Failed to load members"))
      .finally(() => setIsLoading(false));
  }, [canRead]);

  async function loadItemData() {
    if (!selectedEvent) return;
    setIsLoadingItemData(true);
    const [itemsData, configData, setupData] = await Promise.all([
      listEventItems(selectedEvent.id),
      getLuckyDrawConfig(selectedEvent.id),
      getEventSetup(selectedEvent.id),
    ]);
    setItems(itemsData);
    setConfig(configData);
    setSetup(setupData);
    setIsLoadingItemData(false);
  }

  useEffect(() => {
    loadItemData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvent]);

  const summary = useMemo(() => {
    const ticketsSold = config.tickets_sold || 0;
    const luckyDrawAmount = ticketsSold * (setup?.lucky_draw_ticket_price || 0);
    const auctionAmount = items
      .filter((i) => i.item_type === "auction")
      .reduce((sum, i) => sum + (i.value_sold || 0), 0);
    const otherDonation = config.other_donation || 0;
    const totalDonations = luckyDrawAmount + auctionAmount + otherDonation;

    return {
      ticketsSold,
      luckyDrawAmount,
      auctionAmount,
      otherDonation,
      totalDonations,
      prizePool: luckyDrawAmount + otherDonation,
      totalGifts: items.length,
      auctionCount: items.filter((i) => i.item_type === "auction").length,
      onStageCount: items.filter((i) => i.item_type === "lucky_draw_on_stage").length,
      luckyDrawCount: items.filter((i) => i.item_type === "lucky_draw").length,
    };
  }, [items, config, setup]);

  const visibleItems = useMemo(() => {
    let rows = items;
    if (typeFilters.length > 0) {
      rows = rows.filter((item) => typeFilters.includes(item.item_type));
    }
    if (statusFilters.length > 0) {
      rows = rows.filter((item) => statusFilters.includes(item.status));
    }
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const av = itemSortValue(a, sortKey);
        const bv = itemSortValue(b, sortKey);
        const cmp =
          typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [items, typeFilters, statusFilters, sortKey, sortDir]);

  async function handleSaveConfig(e) {
    e.preventDefault();
    setIsSavingConfig(true);
    try {
      const saved = await saveLuckyDrawConfig(selectedEvent.id, {
        tickets_sold: Number(config.tickets_sold) || 0,
        other_donation: Number(config.other_donation) || 0,
      });
      setConfig(saved);
    } finally {
      setIsSavingConfig(false);
    }
  }

  function openCreate() {
    setEditingItem(null);
    setIsFormOpen(true);
  }

  function openEdit(item) {
    setEditingItem(item);
    setIsFormOpen(true);
  }

  function handleSaved() {
    setIsFormOpen(false);
    setEditingItem(null);
    loadItemData();
  }

  async function handleDelete(item) {
    if (!window.confirm(`Delete item ${item.lot_ref} — ${item.name}?`)) return;
    await deleteEventItem(selectedEvent.id, item.id);
    loadItemData();
  }

  async function handleDownloadReport(downloadFn, reportKey) {
    setReportErrors((current) => ({ ...current, [reportKey]: null }));
    setGeneratingReport(reportKey);
    try {
      const { blob, filename } = await downloadFn(selectedEvent.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setReportErrors((current) => ({
        ...current,
        [reportKey]: err.detail || "Failed to generate report",
      }));
    } finally {
      setGeneratingReport(null);
    }
  }

  if (!canRead) {
    return (
      <div className="admin-page event-lucky-draw-page">
        <h1>Lucky Draw &amp; Auction</h1>
        <p role="alert">You do not have permission to view Lucky Draw &amp; Auction.</p>
      </div>
    );
  }

  const reportButtonClass = isMinimal
    ? "inline-flex h-[38px] items-center gap-[7px] rounded-[8px] border border-[var(--border)] bg-transparent px-[15px] text-[13.5px] font-semibold text-[var(--ink-2)] hover:bg-[var(--bg-alt)] disabled:opacity-50"
    : "rounded-[10px] bg-[var(--color-brand-blue-light)] px-4 py-[9px] text-[13px] font-semibold text-[var(--color-brand-blue)]";

  return (
    <div className="admin-page admin-page-wide event-lucky-draw-page">
      {!isMinimal && (
        <div className="mb-5 flex items-center justify-between">
          <h1 className="m-0 text-2xl font-semibold text-[var(--text-h)]">Lucky Draw &amp; Auction</h1>
          {canWrite && selectedEvent && (
            <button
              type="button"
              onClick={openCreate}
              className="rounded-[10px] bg-[var(--color-brand-blue)] px-[18px] py-[9px] text-[13px] font-semibold text-white"
            >
              Add Item
            </button>
          )}
        </div>
      )}

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && (
        <>
          {selectedEvent && isLoadingItemData && <p>Loading item data…</p>}

          {selectedEvent && !isLoadingItemData && (
            <>
              {isMinimal ? (
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-[18px_22px]">
                  <form onSubmit={handleSaveConfig} className="flex flex-wrap items-end gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor="lucky-draw-tickets-sold"
                        className="pl-0.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]"
                      >
                        Tickets sold
                      </label>
                      <input
                        id="lucky-draw-tickets-sold"
                        type="number"
                        value={config.tickets_sold}
                        onChange={(e) => setConfig({ ...config, tickets_sold: e.target.value })}
                        disabled={!canWrite}
                        className="h-[38px] w-[100px] rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13.5px] text-[var(--ink)]"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor="lucky-draw-other-donation"
                        className="pl-0.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]"
                      >
                        Other donation (HKD)
                      </label>
                      <input
                        id="lucky-draw-other-donation"
                        type="number"
                        step="0.01"
                        value={config.other_donation}
                        onChange={(e) => setConfig({ ...config, other_donation: e.target.value })}
                        disabled={!canWrite}
                        className="h-[38px] w-[130px] rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13.5px] text-[var(--ink)]"
                      />
                    </div>
                    {canWrite && (
                      <button
                        type="submit"
                        disabled={isSavingConfig}
                        className="inline-flex h-[38px] items-center rounded-[8px] bg-[var(--accent)] px-[15px] text-[13.5px] font-semibold text-white hover:bg-[var(--accent-ink)] disabled:opacity-50"
                      >
                        {isSavingConfig ? "Saving…" : "Save"}
                      </button>
                    )}
                  </form>
                  <div className="text-right">
                    <span className="block text-[20px] font-bold text-[var(--gold-ink)]">
                      {formatCurrency(summary.prizePool)}
                    </span>
                    <span className="text-[12px] text-[var(--faint)]">Prize pool</span>
                  </div>
                </div>
              ) : (
                <Card variant="default" className="mb-4 flex flex-wrap items-center gap-7 p-[18px_22px]">
                  <form
                    onSubmit={handleSaveConfig}
                    className="flex flex-wrap items-end gap-7 event-lucky-draw-config-form"
                  >
                    <label
                      htmlFor="lucky-draw-tickets-sold"
                      className="flex flex-col gap-[6px] text-[12px] text-[var(--color-muted-text)]"
                    >
                      Tickets sold
                      <input
                        id="lucky-draw-tickets-sold"
                        type="number"
                        value={config.tickets_sold}
                        onChange={(e) => setConfig({ ...config, tickets_sold: e.target.value })}
                        disabled={!canWrite}
                        className="w-[100px] rounded-[10px] border border-[var(--color-border-medium)] px-3 py-2 text-[14px] text-[var(--text-h)]"
                      />
                    </label>
                    <label
                      htmlFor="lucky-draw-other-donation"
                      className="flex flex-col gap-[6px] text-[12px] text-[var(--color-muted-text)]"
                    >
                      Other donation (HKD)
                      <input
                        id="lucky-draw-other-donation"
                        type="number"
                        step="0.01"
                        value={config.other_donation}
                        onChange={(e) => setConfig({ ...config, other_donation: e.target.value })}
                        disabled={!canWrite}
                        className="w-[120px] rounded-[10px] border border-[var(--color-border-medium)] px-3 py-2 text-[14px] text-[var(--text-h)]"
                      />
                    </label>
                    {canWrite && (
                      <button
                        type="submit"
                        disabled={isSavingConfig}
                        className="rounded-[10px] bg-[var(--color-brand-blue)] px-4 py-2 text-[13px] font-semibold text-white"
                      >
                        {isSavingConfig ? "Saving…" : "Save"}
                      </button>
                    )}
                  </form>
                  <div className="ml-auto text-right">
                    <span className="block text-[20px] font-bold text-[var(--color-tone-amber-text)]">
                      {formatCurrency(summary.prizePool)}
                    </span>
                    <span className="text-[12px] text-[var(--color-muted-text)]">Prize pool</span>
                  </div>
                </Card>
              )}

              <div className={`mb-4 flex ${isMinimal ? "items-end justify-between" : "items-center"} flex-wrap gap-3`}>
                <div className="flex flex-wrap items-end gap-3">
                  <button
                    type="button"
                    onClick={() => handleDownloadReport(downloadProgrammeReport, "programme")}
                    disabled={generatingReport === "programme"}
                    className={reportButtonClass}
                  >
                    {isMinimal && <FileDown className="w-[15px] h-[15px]" aria-hidden="true" />}
                    {generatingReport === "programme" ? "Generating…" : "Programme List"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadReport(downloadLuckyDrawResultsReport, "results")}
                    disabled={generatingReport === "results"}
                    className={reportButtonClass}
                  >
                    {isMinimal && <FileDown className="w-[15px] h-[15px]" aria-hidden="true" />}
                    {generatingReport === "results" ? "Generating…" : "Lucky Draw Results"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadReport(downloadAuctionReceiptsReport, "auction-receipts")}
                    disabled={generatingReport === "auction-receipts"}
                    className={reportButtonClass}
                  >
                    {isMinimal && <FileDown className="w-[15px] h-[15px]" aria-hidden="true" />}
                    {generatingReport === "auction-receipts" ? "Generating…" : "Auction Receipts"}
                  </button>
                  <MultiSelectDropdown
                    icon={Filter}
                    ariaLabel="Type"
                    allLabel="All types"
                    options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))}
                    selected={typeFilters}
                    onToggleOption={(value) => toggleFilter(setTypeFilters, value)}
                    onClear={() => setTypeFilters([])}
                  />
                  <MultiSelectDropdown
                    icon={Filter}
                    ariaLabel="Status"
                    allLabel="All statuses"
                    options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))}
                    selected={statusFilters}
                    onToggleOption={(value) => toggleFilter(setStatusFilters, value)}
                    onClear={() => setStatusFilters([])}
                  />
                </div>
                {isMinimal && canWrite && selectedEvent && (
                  <button
                    type="button"
                    onClick={openCreate}
                    className="inline-flex h-[38px] items-center gap-[7px] rounded-[8px] bg-[var(--accent)] px-[15px] text-[13.5px] font-semibold text-white hover:bg-[var(--accent-ink)]"
                  >
                    <Plus className="w-[15px] h-[15px]" aria-hidden="true" />
                    Add Item
                  </button>
                )}
              </div>
              {reportErrors.programme && <p role="alert">{reportErrors.programme}</p>}
              {reportErrors.results && <p role="alert">{reportErrors.results}</p>}
              {reportErrors["auction-receipts"] && (
                <p role="alert">{reportErrors["auction-receipts"]}</p>
              )}

              <div className={`mb-4 flex flex-wrap gap-3 ${isMinimal ? "stat-duo-grid" : ""}`}>
                {[
                  { value: summary.ticketsSold, label: "Tickets Sold" },
                  { value: formatCurrency(summary.luckyDrawAmount), label: "Lucky Draw Amount" },
                  { value: formatCurrency(summary.auctionAmount), label: "Auction Amount" },
                  { value: formatCurrency(summary.otherDonation), label: "Other Donation" },
                  { value: formatCurrency(summary.totalDonations), label: "Total Donations" },
                ].map(({ value, label }, index) => {
                  const tone = (isMinimal ? TILE_TONES_MINIMAL : TILE_TONES)[index % 5];
                  return (
                    <StatTile
                      key={label}
                      isMinimal={isMinimal}
                      bg={tone.bg}
                      color={tone.color}
                      value={value}
                      label={label}
                    />
                  );
                })}
              </div>

              <div className={`mb-4 flex flex-wrap gap-3 ${isMinimal ? "stat-duo-grid" : ""}`}>
                {[
                  { value: summary.totalGifts, label: "Total Gifts" },
                  { value: summary.auctionCount, label: "Auction" },
                  { value: summary.onStageCount, label: "Lucky Draw On Stage" },
                  { value: summary.luckyDrawCount, label: "Lucky Draw" },
                ].map(({ value, label }, index) => {
                  const tone = (isMinimal ? TILE_TONES_MINIMAL : TILE_TONES)[(index + 1) % 5];
                  return (
                    <StatTile
                      key={label}
                      isMinimal={isMinimal}
                      bg={tone.bg}
                      color={tone.color}
                      value={value}
                      label={label}
                    />
                  );
                })}
              </div>

              {items.length === 0 ? (
                <p className="member-empty-state">No items added for this event yet.</p>
              ) : visibleItems.length === 0 ? (
                <p className="member-empty-state">No items match the selected filters.</p>
              ) : (
                <TableWrapper isMinimal={isMinimal}>
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-[var(--color-border-faint)]">
                        {SORTABLE_COLUMNS.map(({ key, label }) => (
                          <th
                            key={key}
                            className="px-4 py-3 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]"
                          >
                            <button
                              type="button"
                              onClick={() => toggleSort(key)}
                              className="inline-flex items-center gap-1 bg-transparent p-0 uppercase tracking-[0.03em] text-inherit"
                            >
                              {label}
                              {sortKey === key ? (
                                sortDir === "asc" ? (
                                  <ChevronUp className="w-3 h-3" aria-hidden="true" />
                                ) : (
                                  <ChevronDown className="w-3 h-3" aria-hidden="true" />
                                )
                              ) : (
                                <ChevronsUpDown className="w-3 h-3 opacity-40" aria-hidden="true" />
                              )}
                            </button>
                          </th>
                        ))}
                        <th className="px-4 py-3 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleItems.map((item) => {
                        const chip = (isMinimal ? TYPE_CHIP_MINIMAL : TYPE_CHIP)[item.item_type];
                        return (
                          <tr
                            key={item.id}
                            className="border-b border-[var(--color-border-light)] text-[13px] text-[var(--text-h)] last:border-b-0"
                          >
                            <td className="px-4 py-[13px] text-[var(--color-muted-text)]">{item.lot_ref}</td>
                            <td className="px-4 py-[13px] font-semibold">{item.name}</td>
                            <td className="px-4 py-[13px]">
                              {item.value_hkd != null ? formatCurrency(item.value_hkd) : "—"}
                            </td>
                            <td className="px-4 py-[13px] text-[var(--color-muted-text)]">
                              {item.donor_sponsor || "—"}
                            </td>
                            <td className="px-4 py-[13px] text-[var(--color-muted-text)]">
                              {item.contact_rotary_name || "—"}
                            </td>
                            <td className="px-4 py-[13px]">
                              <span
                                className="w-fit rounded-full px-[10px] py-[3px] text-[11px] font-bold"
                                style={{ background: chip.bg, color: chip.color }}
                              >
                                {TYPE_LABEL[item.item_type]}
                              </span>
                            </td>
                            <td className="px-4 py-[13px]">{item.ad_page ? "Yes" : "No"}</td>
                            <td className="px-4 py-[13px]">{STATUS_LABEL[item.status]}</td>
                            <td className="px-4 py-[13px]">
                              {item.item_type === "auction" && item.value_sold != null
                                ? formatCurrency(item.value_sold)
                                : "—"}
                            </td>
                            <td className="px-4 py-[13px]">
                              {canWrite && (
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => openEdit(item)}
                                    title="Edit"
                                    className="event-iact"
                                  >
                                    <Pencil className="w-[14px] h-[14px]" aria-hidden="true" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(item)}
                                    title="Delete"
                                    className="event-iact event-iact-danger"
                                  >
                                    <Trash2 className="w-[14px] h-[14px]" aria-hidden="true" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableWrapper>
              )}
            </>
          )}
        </>
      )}

      {isFormOpen && selectedEvent && (
        <EventItemFormModal
          eventId={selectedEvent.id}
          item={editingItem}
          members={members}
          onClose={() => setIsFormOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
