import { apiFetch } from "./client";

export function fetchMemberStatistics() {
  return apiFetch("/members/statistics");
}
