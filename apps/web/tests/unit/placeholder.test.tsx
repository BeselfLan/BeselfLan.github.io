import { render, screen } from "@testing-library/react";
import { content } from "@beself/content";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";

describe("placeholder page", () => {
  it("renders the heading", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: /BeselfOS v2/ })).toBeDefined();
  });

  it("links the content workspace package", () => {
    expect(typeof content).toBe("object");
  });
});
