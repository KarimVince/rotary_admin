import {
  createEventCost,
  deleteEventCost,
  downloadEventCostReport,
  listEventCosts,
  updateEventCost,
} from "../api/eventCosts";
import { listEventCostCategories } from "../api/eventSetup";
import EventCategoryEntryPage from "../components/EventCategoryEntryPage";

export default function EventOperationalCost({ event }) {
  return (
    <EventCategoryEntryPage
      event={event}
      title="Operational Cost"
      accessKey="event.costs"
      totalFieldLabel="Total Cost"
      showTotalRow
      listCategoriesFn={listEventCostCategories}
      listEntriesFn={listEventCosts}
      createEntryFn={createEventCost}
      updateEntryFn={updateEventCost}
      deleteEntryFn={deleteEventCost}
      downloadReportFn={downloadEventCostReport}
    />
  );
}
