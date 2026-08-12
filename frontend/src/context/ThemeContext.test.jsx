import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ThemeProvider, useTheme } from "./ThemeContext";

function Probe() {
  const { isMinimal } = useTheme();
  return <span data-testid="is-minimal">{String(isMinimal)}</span>;
}

describe("ThemeContext", () => {
  it("always reports the single (Minimal) design and sets data-theme accordingly", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("is-minimal")).toHaveTextContent("true");
    expect(document.documentElement.dataset.theme).toBe("minimal");
  });
});
