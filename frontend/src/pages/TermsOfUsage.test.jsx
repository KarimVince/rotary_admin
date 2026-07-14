import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TermsOfUsage from "./TermsOfUsage";

describe("TermsOfUsage", () => {
  it("renders the terms heading and legal sections", () => {
    render(<TermsOfUsage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /terms of usage — rotary club of discovery bay/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /acceptance of terms/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /contact/i })).toBeInTheDocument();
  });

  it("links Support contact to the club's email", () => {
    render(<TermsOfUsage />);

    const link = screen.getByRole("link", { name: /rcdbball@gmail\.com/i });
    expect(link).toHaveAttribute("href", "mailto:rcdbball@gmail.com");
  });
});
