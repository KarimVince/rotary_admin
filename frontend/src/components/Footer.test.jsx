import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Footer from "./Footer";

describe("Footer", () => {
  it("renders the current-year copyright notice", () => {
    render(<Footer />, { wrapper: MemoryRouter });

    const year = new Date().getFullYear();
    expect(screen.getByText(new RegExp(`© ${year} Rotary Club of Discovery Bay`))).toBeInTheDocument();
  });

  it("links Terms of Usage and Privacy Policy to their routes", () => {
    render(<Footer />, { wrapper: MemoryRouter });

    expect(screen.getByRole("link", { name: /terms of usage/i })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: /privacy policy/i })).toHaveAttribute("href", "/privacy");
  });

  it("links Support to a mailto address", () => {
    render(<Footer />, { wrapper: MemoryRouter });

    expect(screen.getByRole("link", { name: /support/i })).toHaveAttribute(
      "href",
      "mailto:rcdbball@gmail.com",
    );
  });
});
