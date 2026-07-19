import { useEffect, useState } from "react";
import {
  createEventCostCategory,
  createEventSponsorCategory,
  deleteEventCostCategory,
  deleteEventSponsorCategory,
  getEventSetup,
  listEventCostCategories,
  listEventSponsorCategories,
  saveEventSetup,
  updateEventCostCategory,
  updateEventSponsorCategory,
} from "../api/eventSetup";
import { useAccess } from "../hooks/useAccess";
import EventCategoryList from "../components/EventCategoryList";
import EventTableMappingSection from "../components/EventTableMappingSection";

const FIELDS = [
  { key: "ticket_price_normal", label: "Ticket price (normal)", id: "ticket-price-normal" },
  { key: "ticket_price_early_bird", label: "Ticket price (early bird)", id: "ticket-price-early-bird" },
  { key: "lucky_draw_ticket_price", label: "Lucky draw ticket price", id: "lucky-draw-ticket-price" },
  { key: "payment_deadline", label: "Payment deadline", id: "payment-deadline", type: "date" },
  { key: "bank_account", label: "Bank account", id: "bank-account", type: "text" },
  { key: "fps_id", label: "FPS ID", id: "fps-id", type: "text" },
];

export default function EventSetup({ event: selectedEvent }) {
  const { canRead, canWrite } = useAccess("event.setup");

  const [prices, setPrices] = useState({
    ticket_price_normal: "",
    ticket_price_early_bird: "",
    lucky_draw_ticket_price: "",
    payment_deadline: "",
    bank_account: "",
    fps_id: "",
  });
  const [isSavingPrices, setIsSavingPrices] = useState(false);
  const [priceSaveError, setPriceSaveError] = useState(null);
  const [priceSaved, setPriceSaved] = useState(false);

  useEffect(() => {
    if (!selectedEvent) return;
    getEventSetup(selectedEvent.id).then((setup) => {
      setPrices({
        ticket_price_normal: setup.ticket_price_normal ?? "",
        ticket_price_early_bird: setup.ticket_price_early_bird ?? "",
        lucky_draw_ticket_price: setup.lucky_draw_ticket_price ?? "",
        payment_deadline: setup.payment_deadline ?? "",
        bank_account: setup.bank_account ?? "",
        fps_id: setup.fps_id ?? "",
      });
    });
  }, [selectedEvent]);

  async function handleSavePrices(e) {
    e.preventDefault();
    setIsSavingPrices(true);
    setPriceSaveError(null);
    setPriceSaved(false);
    try {
      await saveEventSetup(selectedEvent.id, {
        ticket_price_normal: prices.ticket_price_normal === "" ? null : Number(prices.ticket_price_normal),
        ticket_price_early_bird:
          prices.ticket_price_early_bird === "" ? null : Number(prices.ticket_price_early_bird),
        lucky_draw_ticket_price:
          prices.lucky_draw_ticket_price === "" ? null : Number(prices.lucky_draw_ticket_price),
        payment_deadline: prices.payment_deadline || null,
        bank_account: prices.bank_account || null,
        fps_id: prices.fps_id || null,
      });
      setPriceSaved(true);
    } catch (err) {
      setPriceSaveError(err.detail || "Failed to save prices");
    } finally {
      setIsSavingPrices(false);
    }
  }

  if (!canRead) {
    return (
      <div className="admin-page event-setup-page">
        <h1>Event Setup</h1>
        <p role="alert">You do not have permission to view Event Setup.</p>
      </div>
    );
  }

  return (
    <div className="admin-page admin-page-wide event-setup-page">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="m-0 text-2xl font-semibold text-[#0c2340]">Event Setup</h1>
        {selectedEvent && canWrite && (
          <button
            type="submit"
            form="event-setup-form"
            disabled={isSavingPrices}
            className="rounded-[10px] bg-[var(--color-brand-blue)] px-[18px] py-[9px] text-[13px] font-semibold text-white"
          >
            {isSavingPrices ? "Saving…" : "Save changes"}
          </button>
        )}
      </div>

      {selectedEvent && (
        <>
          <div className="mb-4 rounded-2xl bg-white p-[22px] shadow-[var(--shadow-card)]">
            <span className="text-[13px] font-bold uppercase tracking-[0.03em] text-[#0c2340]">
              Ticketing &amp; payment
            </span>
            <form
              id="event-setup-form"
              onSubmit={handleSavePrices}
              className="mt-[14px] grid grid-cols-1 gap-[14px] md:grid-cols-2"
            >
              {FIELDS.map(({ key, label, id, type }) => (
                <label
                  key={id}
                  htmlFor={id}
                  className="flex flex-col gap-[6px] text-[12px] text-[var(--color-muted-text)]"
                >
                  {label}
                  <input
                    id={id}
                    type={type ?? "number"}
                    step={type ? undefined : "0.01"}
                    value={prices[key]}
                    onChange={(e) => setPrices({ ...prices, [key]: e.target.value })}
                    disabled={!canWrite}
                    className="rounded-[10px] border border-[var(--color-border-medium)] px-3 py-[10px] text-[14px] text-[#0c2340]"
                  />
                </label>
              ))}
            </form>
            {priceSaveError && (
              <p role="alert" className="mt-3 text-[13px] text-[var(--color-tone-rose-text)]">
                {priceSaveError}
              </p>
            )}
            {priceSaved && <p className="mt-3 text-[13px] text-[var(--color-tone-teal-text)]">Prices saved.</p>}
          </div>

          <div className="mb-4">
            <EventTableMappingSection eventId={selectedEvent.id} />
          </div>
        </>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <EventCategoryList
          label="Cost Categories"
          listFn={listEventCostCategories}
          createFn={createEventCostCategory}
          updateFn={updateEventCostCategory}
          deleteFn={deleteEventCostCategory}
        />

        <EventCategoryList
          label="Sponsor Categories"
          listFn={listEventSponsorCategories}
          createFn={createEventSponsorCategory}
          updateFn={updateEventSponsorCategory}
          deleteFn={deleteEventSponsorCategory}
        />
      </div>
    </div>
  );
}
