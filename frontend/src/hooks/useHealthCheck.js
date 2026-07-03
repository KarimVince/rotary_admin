import { useEffect, useState } from "react";
import { apiFetch } from "../api/client";

export function useHealthCheck() {
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    apiFetch("/health")
      .then((data) => setStatus(data.status))
      .catch(() => setStatus("error"));
  }, []);

  return status;
}
