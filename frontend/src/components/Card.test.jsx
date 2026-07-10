import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Card from "./Card";

describe("Card", () => {
  it("renders children and defaults to the 'default' variant", () => {
    render(<Card>content</Card>);

    const card = screen.getByText("content");
    expect(card).toHaveAttribute("data-variant", "default");
  });

  it("applies the elevated variant", () => {
    render(<Card variant="elevated">content</Card>);

    expect(screen.getByText("content")).toHaveAttribute("data-variant", "elevated");
  });

  it("applies the hero variant", () => {
    render(<Card variant="hero">content</Card>);

    expect(screen.getByText("content")).toHaveAttribute("data-variant", "hero");
  });

  it("merges a custom className with the variant classes", () => {
    render(<Card className="custom-class">content</Card>);

    expect(screen.getByText("content")).toHaveClass("custom-class");
  });

  it("forwards arbitrary props (e.g. onClick) to the underlying element", () => {
    let clicked = false;
    render(<Card onClick={() => (clicked = true)}>content</Card>);

    screen.getByText("content").click();
    expect(clicked).toBe(true);
  });
});
