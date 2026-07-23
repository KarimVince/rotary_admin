import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../test/mocks/server";
import { currentRotaryYear } from "../utils/rotaryYear";
import { useRotaryYears } from "./useRotaryYears";

const API_BASE_URL = "http://localhost:8000/api/v1";

function rotaryYearRow(year, isCurrent = false) {
  return {
    id: `year-${year}`,
    year,
    label: `${year}–${year + 1}`,
    start_date: `${year}-07-01`,
    end_date: `${year + 1}-06-30`,
    is_current: isCurrent,
    created_at: "2026-01-01T00:00:00Z",
  };
}

describe("useRotaryYears", () => {
  it("returns a descending year list and the is_current row as currentYear", async () => {
    server.use(
      http.get(`${API_BASE_URL}/rotary-years`, () =>
        HttpResponse.json([
          rotaryYearRow(2023),
          rotaryYearRow(2024, true),
          rotaryYearRow(2025),
        ]),
      ),
    );

    const { result } = renderHook(() => useRotaryYears());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.yearOptions).toEqual([2025, 2024, 2023]);
    expect(result.current.currentYear).toBe(2024);
  });

  it("falls back to date-math currentRotaryYear() when nothing is flagged current", async () => {
    server.use(
      http.get(`${API_BASE_URL}/rotary-years`, () => HttpResponse.json([rotaryYearRow(2023)])),
    );

    const { result } = renderHook(() => useRotaryYears());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.currentYear).toBe(currentRotaryYear());
  });

  it("surfaces a load error", async () => {
    server.use(
      http.get(`${API_BASE_URL}/rotary-years`, () =>
        HttpResponse.json({ detail: "nope" }, { status: 403 }),
      ),
    );

    const { result } = renderHook(() => useRotaryYears());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.loadError).toBeTruthy();
  });

  it("selectedYear starts at the date-math fallback then corrects itself to is_current once loaded", async () => {
    server.use(
      http.get(`${API_BASE_URL}/rotary-years`, () => HttpResponse.json([rotaryYearRow(2019, true)])),
    );

    const { result } = renderHook(() => useRotaryYears());

    expect(result.current.selectedYear).toBe(currentRotaryYear());

    await waitFor(() => expect(result.current.selectedYear).toBe(2019));
  });

  it("never overrides a manually-changed selectedYear once the table has loaded", async () => {
    server.use(
      http.get(`${API_BASE_URL}/rotary-years`, () =>
        HttpResponse.json([rotaryYearRow(2024, true), rotaryYearRow(2023)]),
      ),
    );

    const { result } = renderHook(() => useRotaryYears());

    await waitFor(() => expect(result.current.selectedYear).toBe(2024));

    result.current.setSelectedYear(2023);

    await waitFor(() => expect(result.current.selectedYear).toBe(2023));
    // Give any stray effect a chance to run, then confirm it's still 2023.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(result.current.selectedYear).toBe(2023);
  });
});
