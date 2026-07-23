import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWindowFocusRefetch } from "./useWindowFocusRefetch";

describe("useWindowFocusRefetch", () => {
  it("calls the callback when the window regains focus", () => {
    const callback = vi.fn();
    renderHook(() => useWindowFocusRefetch(callback));

    window.dispatchEvent(new Event("focus"));

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("calls the callback when the document becomes visible again", () => {
    const callback = vi.fn();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    renderHook(() => useWindowFocusRefetch(callback));

    document.dispatchEvent(new Event("visibilitychange"));

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("does not call the callback while the document is hidden", () => {
    const callback = vi.fn();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    renderHook(() => useWindowFocusRefetch(callback));

    document.dispatchEvent(new Event("visibilitychange"));

    expect(callback).not.toHaveBeenCalled();
  });

  it("does nothing when disabled", () => {
    const callback = vi.fn();
    renderHook(() => useWindowFocusRefetch(callback, false));

    window.dispatchEvent(new Event("focus"));

    expect(callback).not.toHaveBeenCalled();
  });

  it("always uses the latest callback without re-subscribing", () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    const firstCallback = vi.fn();
    const secondCallback = vi.fn();
    const { rerender } = renderHook(({ cb }) => useWindowFocusRefetch(cb), {
      initialProps: { cb: firstCallback },
    });

    rerender({ cb: secondCallback });
    window.dispatchEvent(new Event("focus"));

    expect(firstCallback).not.toHaveBeenCalled();
    expect(secondCallback).toHaveBeenCalledTimes(1);
  });
});
