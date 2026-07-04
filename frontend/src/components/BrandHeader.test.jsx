import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BrandHeader from "./BrandHeader";

describe("BrandHeader", () => {
  it("renders the logo and app title as the page heading when size is large", () => {
    render(<BrandHeader size="large" />);

    expect(screen.getByAltText(/rotary club of discovery bay logo/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /rotary club of discovery bay database/i }),
    ).toBeInTheDocument();
  });

  it("renders the title as plain text (not a competing heading) at other sizes", () => {
    render(<BrandHeader size="small" />);

    expect(screen.getByText(/rotary club of discovery bay database/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
