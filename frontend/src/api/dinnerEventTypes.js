import { apiFetch } from "./client";

export function listDinnerEventTypes() {
  return apiFetch("/dinner-event-types");
}

export function createDinnerEventType(payload) {
  return apiFetch("/dinner-event-types", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateDinnerEventType(typeId, payload) {
  return apiFetch(`/dinner-event-types/${typeId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function reorderDinnerEventTypes(items) {
  return apiFetch("/dinner-event-types/reorder", {
    method: "PATCH",
    body: JSON.stringify({ items }),
  });
}

export function deleteDinnerEventType(typeId) {
  return apiFetch(`/dinner-event-types/${typeId}`, {
    method: "DELETE",
  });
}
