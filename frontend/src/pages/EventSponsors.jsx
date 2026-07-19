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
      listCategoriesFn={listEventSponsorCategories}
      listEntriesFn={listEventSponsors}
      createEntryFn={createEventSponsor}
      updateEntryFn={updateEventSponsor}
      deleteEntryFn={deleteEventSponsor}
      downloadReportFn={downloadEventSponsorReport}
    />
  );
}
