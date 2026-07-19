import { useEffect, useMemo, useState } from "react";
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
import { formatCurrency } from "../utils/formatters";
import EventItemFormModal from "../components/EventItemFormModal";
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

function StatTile({ bg, color, value, label }) {
  return (
    <div className="rounded-2xl p-[14px_18px]" style={{ background: bg }}>
      <span className="block text-[20px] font-bold" style={{ color }}>
        {value}
      </span>
      <span className="text-[12px] text-[#3c4655]">{label}</span>
    </div>
  );
}

export default function EventLuckyDraw({ event: selectedEvent }) {
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
        <h1>Lucky Draw & Auction</h1>
        <p role="alert">You do not have permission to view Lucky Draw & Auction.</p>
      </div>
    );
  }

  return (
    <div className="admin-page admin-page-wide event-lucky-draw-page">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="m-0 text-2xl font-semibold text-[#0c2340]">Lucky Draw &amp; Auction</h1>
        {canWrite && selectedEvent && (
          <button
            type="button"
            onClick={openCreate}
            className="rounded-[10px] bg-[var(--color-brand-blue)] px-[18px] py-[9px] text-[13px] font-semibold text-white"
          >
            + Add Item
          </button>
        )}
      </div>

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && (
        <>
          {selectedEvent && isLoadingItemData && <p>Loading item data…</p>}

          {selectedEvent && !isLoadingItemData && (
            <>
              <Card
                variant="default"
                className="mb-4 flex flex-wrap items-center gap-7 p-[18px_22px]"
              >
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
                      className="w-[100px] rounded-[10px] border border-[var(--color-border-medium)] px-3 py-2 text-[14px] text-[#0c2340]"
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
                      className="w-[120px] rounded-[10px] border border-[var(--color-border-medium)] px-3 py-2 text-[14px] text-[#0c2340]"
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

              <div className="mb-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => handleDownloadReport(downloadProgrammeReport, "programme")}
                  disabled={generatingReport === "programme"}
                  className="rounded-[10px] bg-[var(--color-brand-blue-light)] px-4 py-[9px] text-[13px] font-semibold text-[var(--color-brand-blue)]"
                >
                  {generatingReport === "programme" ? "Generating…" : "Programme List"}
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadReport(downloadLuckyDrawResultsReport, "results")}
                  disabled={generatingReport === "results"}
                  className="rounded-[10px] bg-[var(--color-brand-blue-light)] px-4 py-[9px] text-[13px] font-semibold text-[var(--color-brand-blue)]"
                >
                  {generatingReport === "results" ? "Generating…" : "Lucky Draw Results"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleDownloadReport(downloadAuctionReceiptsReport, "auction-receipts")
                  }
                  disabled={generatingReport === "auction-receipts"}
                  className="rounded-[10px] bg-[var(--color-brand-blue-light)] px-4 py-[9px] text-[13px] font-semibold text-[var(--color-brand-blue)]"
                >
                  {generatingReport === "auction-receipts" ? "Generating…" : "Auction Receipts"}
                </button>
              </div>
              {reportErrors.programme && <p role="alert">{reportErrors.programme}</p>}
              {reportErrors.results && <p role="alert">{reportErrors.results}</p>}
              {reportErrors["auction-receipts"] && (
                <p role="alert">{reportErrors["auction-receipts"]}</p>
              )}

              <div className="mb-4 flex flex-wrap gap-3">
                <StatTile
                  bg="var(--tone-amber-bg)"
                  color="var(--color-tone-amber-text)"
                  value={summary.ticketsSold}
                  label="Tickets Sold"
                />
                <StatTile
                  bg="var(--tone-blue-bg)"
                  color="var(--color-brand-blue)"
                  value={formatCurrency(summary.luckyDrawAmount)}
                  label="Lucky Draw Amount"
                />
                <StatTile
                  bg="var(--tone-lavender-bg)"
                  color="var(--color-tone-lavender-text)"
                  value={formatCurrency(summary.auctionAmount)}
                  label="Auction Amount"
                />
                <StatTile
                  bg="var(--tone-teal-bg)"
                  color="var(--color-tone-teal-text)"
                  value={formatCurrency(summary.otherDonation)}
                  label="Other Donation"
                />
                <StatTile
                  bg="var(--tone-rose-bg)"
                  color="var(--color-tone-rose-text)"
                  value={formatCurrency(summary.totalDonations)}
                  label="Total Donations"
                />
              </div>

              <div className="mb-4 flex flex-wrap gap-3">
                <StatTile bg="var(--color-border-light)" color="#0c2340" value={summary.totalGifts} label="Total Gifts" />
                <StatTile
                  bg="var(--tone-lavender-bg)"
                  color="var(--color-tone-lavender-text)"
                  value={summary.auctionCount}
                  label="Auction"
                />
                <StatTile
                  bg="var(--tone-blue-bg)"
                  color="var(--color-brand-blue)"
                  value={summary.onStageCount}
                  label="Lucky Draw On Stage"
                />
                <StatTile
                  bg="var(--tone-blue-bg)"
                  color="var(--color-brand-blue)"
                  value={summary.luckyDrawCount}
                  label="Lucky Draw"
                />
              </div>

              {items.length === 0 ? (
                <p className="member-empty-state">No items added for this event yet.</p>
              ) : (
                <Card variant="default" className="p-0 overflow-hidden">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-[var(--color-border-faint)]">
                        {[
                          "Lot Ref",
                          "Name",
                          "Value HKD",
                          "Donor / Sponsor",
                          "Contact Rotary",
                          "Type",
                          "Ad Page",
                          "Status",
                          "Value Sold",
                          "Actions",
                        ].map((label) => (
                          <th
                            key={label}
                            className="px-4 py-3 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]"
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => {
                        const chip = TYPE_CHIP[item.item_type];
                        return (
                          <tr
                            key={item.id}
                            className="border-b border-[var(--color-border-light)] text-[13px] text-[#0c2340] last:border-b-0"
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
                            <td className="px-4 py-[13px]">
                              {item.status === "received" ? "Received" : "Not Received"}
                            </td>
                            <td className="px-4 py-[13px]">
                              {item.item_type === "auction" && item.value_sold != null
                                ? formatCurrency(item.value_sold)
                                : "—"}
                            </td>
                            <td className="px-4 py-[13px]">
                              {canWrite && (
                                <div className="flex gap-3">
                                  <button
                                    type="button"
                                    onClick={() => openEdit(item)}
                                    className="bg-transparent p-0 text-[12px] font-semibold text-[var(--color-brand-blue)]"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(item)}
                                    className="bg-transparent p-0 text-[12px] font-semibold text-[var(--color-tone-rose-text)]"
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </Card>
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
