import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeProvider, useTheme } from "./ThemeContext";

function Probe() {
  const { designTheme, isMinimal, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{designTheme}</span>
      <span data-testid="is-minimal">{String(isMinimal)}</span>
      <button type="button" onClick={toggleTheme}>
        Toggle
      </button>
    </div>
  );
}

describe("ThemeContext", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.theme = "";
  });

  it("defaults to classic when nothing is stored", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("classic");
    expect(screen.getByTestId("is-minimal")).toHaveTextContent("false");
  });

  it("toggles to minimal, sets the data-theme attribute, and persists to localStorage", async () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Toggle" }));

    expect(screen.getByTestId("theme")).toHaveTextContent("minimal");
    expect(document.documentElement.dataset.theme).toBe("minimal");
    expect(localStorage.getItem("designTheme")).toBe("minimal");
  });

  it("reads a previously persisted theme on mount", () => {
    localStorage.setItem("designTheme", "minimal");
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("minimal");
  });
});
