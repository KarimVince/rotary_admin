import { apiDownload, apiFetch, apiUpload } from "./client";

export function previewRotaryFriendsImport(file) {
  const formData = new FormData();
  formData.append("file", file);
  return apiUpload("/rotary-friends/import/preview", formData);
}

export function commitRotaryFriendsImport(friends) {
  return apiFetch("/rotary-friends/import", {
    method: "POST",
    body: JSON.stringify({ friends }),
  });
}

export function exportRotaryFriendsCsv() {
  return apiDownload("/rotary-friends/export");
}
