import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PrivacyPolicy from "./PrivacyPolicy";

describe("PrivacyPolicy", () => {
  it("renders the privacy heading and legal sections", () => {
    render(<PrivacyPolicy />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /privacy policy — rotary club of discovery bay/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /who we are/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /data retention/i })).toBeInTheDocument();
  });

  it("links privacy enquiries to the club's email", () => {
    render(<PrivacyPolicy />);

    const links = screen.getAllByRole("link", { name: /rcdbball@gmail\.com/i });
    expect(links.length).toBeGreaterThan(0);
    links.forEach((link) => expect(link).toHaveAttribute("href", "mailto:rcdbball@gmail.com"));
  });
});
