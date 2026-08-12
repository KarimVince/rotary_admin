import {
  createEventSponsor,
  deleteEventSponsor,
  downloadEventSponsorReport,
  listEventSponsors,
  updateEventSponsor,
} from "../api/eventSponsors";
import { listEventSponsorCategories } from "../api/eventSetup";
import EventCategoryEntryPage from "../components/EventCategoryEntryPage";

export default function EventSponsors({ event }) {
  return (
    <EventCategoryEntryPage
      event={event}
      title="Sponsors"
      accessKey="event.sponsors"
      totalFieldLabel="Total Amount"
      // 2026-08-08: report generation hidden for now, per explicit request
      // — Costs (the other page sharing this component) keeps it.
      showReport={false}
      listCategoriesFn={listEventSponsorCategories}
      listEntriesFn={listEventSponsors}
      createEntryFn={createEventSponsor}
      updateEntryFn={updateEventSponsor}
      deleteEntryFn={deleteEventSponsor}
      downloadReportFn={downloadEventSponsorReport}
    />
  );
}
