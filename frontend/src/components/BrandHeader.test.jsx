import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "../context/ThemeContext";
import BrandHeader from "./BrandHeader";

function renderBrandHeader(props) {
  return render(
    <ThemeProvider>
      <BrandHeader {...props} />
    </ThemeProvider>,
  );
}

describe("BrandHeader", () => {
  it("renders the logo and app title as the page heading when size is large", () => {
    renderBrandHeader({ size: "large" });

    expect(screen.getByAltText(/rotary club of discovery bay hong kong/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /rotary club of discovery bay database/i }),
    ).toBeInTheDocument();
  });

  it("renders the title as plain text (not a competing heading) at other sizes", () => {
    renderBrandHeader({ size: "small" });

    expect(screen.getByText(/rotary club of discovery bay database/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
