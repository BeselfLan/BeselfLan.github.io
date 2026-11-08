import { render, screen } from "@testing-library/react";
import { content } from "@beself/content";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOS } from "@/os/store";
import { LoginCard, initials } from "./LoginCard";

beforeEach(() => {
  useOS.setState(useOS.getInitialState(), true);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("initials", () => {
  it.each([
    ["Beself Lan", "BL"],
    ["ada", "A"],
    ["ada lovelace king", "AL"],
    ["   ", "?"],
    ["", "?"],
    ["  grace   hopper ", "GH"],
    ["élan vital", "ÉV"],
  ])("%j gives %j", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});

describe("LoginCard", () => {
  it("shows the profile name, the prompt and a hidden initials tile", () => {
    render(<LoginCard />);
    const name = content.profile.name;
    expect(screen.getByText(name)).toBeTruthy();
    expect(screen.getByText("Click to log in")).toBeTruthy();
    const tile = screen.getByText(initials(name));
    expect(tile.getAttribute("aria-hidden")).toBe("true");
  });

  it("is one button named after the profile", () => {
    render(<LoginCard />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toBe(
      screen.getByRole("button", {
        name: `${content.profile.name} Click to log in`,
      }),
    );
  });

  it("takes focus when it mounts", () => {
    render(<LoginCard />);
    expect(document.activeElement).toBe(screen.getByRole("button"));
  });
});
