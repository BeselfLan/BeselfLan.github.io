import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Screen } from "@/os/screen/Screen";
import { os, useOS } from "@/os/store";
import {
  setupBrowser,
  teardownBrowser,
} from "../../../tests/unit/window/mountLayer";
import { MEDIA_POLL_MS } from "./mediaStatus";
import { power } from "./power";
import { TopBar } from "./TopBar";

// The status line and the tray icon read this variable through the provider.
const mediaState = vi.hoisted(() => ({
  status: "unknown" as "unknown" | "online" | "offline",
}));
vi.mock("@/media/provider", () => ({
  media: {
    resolve: () => Promise.resolve(null),
    status: () => mediaState.status,
  },
}));

beforeEach(() => {
  setupBrowser();
  mediaState.status = "unknown";
  useOS.setState((s) => {
    s.boot.stage = "desktop";
  });
});
afterEach(() => {
  vi.useRealTimers();
  teardownBrowser();
});

const q = (selector: string) => document.querySelector<HTMLElement>(selector);

function openMenu() {
  render(
    <Screen>
      <TopBar />
    </Screen>,
  );
  const trigger = screen.getByRole("button", { name: "System menu" });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}
const dialog = () => screen.getByRole("dialog", { name: "System menu" });
const menu = () => within(dialog()).getByRole("menu", { name: "Power" });
const item = (name: string) =>
  within(menu()).getByRole("menuitem", { name }) as HTMLButtonElement;
const state = () => useOS.getState();
const choose = (name: string) => fireEvent.click(item(name));

describe("the power menu", () => {
  it("opens inside the screen's portal", () => {
    openMenu();
    expect(dialog().closest("[data-screen-portal]")).not.toBeNull();
  });

  it("states the media server's status", () => {
    openMenu();
    expect(dialog().textContent).toContain("Media server: unknown");
  });

  it("follows the status the provider gives", () => {
    mediaState.status = "online";
    openMenu();
    expect(dialog().textContent).toContain("Media server: online");
    expect(dialog().textContent).not.toContain("unknown");
  });

  it("reads the status again while it is open, with the tray icon", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    mediaState.status = "online";
    openMenu();
    expect(dialog().textContent).toContain("Media server: online");

    mediaState.status = "offline";
    act(() => void vi.advanceTimersByTime(MEDIA_POLL_MS));
    expect(dialog().textContent).toContain("Media server: offline");
    // One poller feeds both, so the icon and the text cannot disagree.
    expect(
      q("[data-network-status]")!.getAttribute("data-network-status"),
    ).toBe("offline");
  });

  it("lists Settings, Lock, a rule, Restart and Power Off", () => {
    openMenu();
    const rows = [...menu().children].map((el) =>
      el.getAttribute("role") === "separator" ? "---" : el.textContent,
    );
    expect(rows).toEqual(["Settings", "Lock", "---", "Restart", "Power Off"]);
  });

  it("puts the focus on Settings", () => {
    openMenu();
    expect(document.activeElement).toBe(item("Settings"));
  });

  it("moves between the items with the arrow keys", () => {
    openMenu();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(item("Lock"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(item("Restart"));
  });

  it("closes on Esc once, from the focused item", () => {
    const trigger = openMenu();
    const close = vi.spyOn(os.shell, "setPopover");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(close).toHaveBeenCalledTimes(1);
    expect(state().shell.openPopover).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Tab", () => {
    openMenu();
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(state().shell.openPopover).toBeNull();
  });

  it("closes when an item is chosen and returns the focus", () => {
    const trigger = openMenu();
    choose("Settings");
    expect(state().shell.openPopover).toBeNull();
    expect(screen.queryByRole("dialog", { name: "System menu" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("Settings says it is coming", () => {
  it("pushes one notice, closes the menu and stays on the desktop", () => {
    openMenu();
    choose("Settings");
    expect(state().notifications.items).toHaveLength(1);
    expect(state().notifications.items[0]).toMatchObject({
      title: "Settings",
      body: "The Settings app is coming soon.",
    });
    expect(state().shell.openPopover).toBeNull();
    expect(state().boot.stage).toBe("desktop");
  });
});

describe("Lock says it is unavailable", () => {
  // With the login on, what Lock does depends on the stage table, so
  // power.test.ts tests that with a table that has a lock event and one that
  // does not.
  it("pushes the notice with the login off", () => {
    useOS.setState((s) => {
      s.settings.showLogin = false;
    });
    openMenu();
    choose("Lock");
    expect(state().notifications.items).toHaveLength(1);
    expect(state().notifications.items[0]).toMatchObject({
      title: "Lock",
      body: "Locking is not available.",
    });
    expect(state().boot.stage).toBe("desktop");
    expect(state().shell.openPopover).toBeNull();
  });

  it("calls the lock action and nothing else", () => {
    const lock = vi.spyOn(power, "lock");
    const restart = vi.spyOn(power, "restart");
    openMenu();
    choose("Lock");
    expect(lock).toHaveBeenCalledTimes(1);
    expect(restart).not.toHaveBeenCalled();
  });
});

describe("Restart is a full boot", () => {
  it("restarts in the full mode, whatever mode this session loaded in", () => {
    useOS.setState((s) => {
      s.boot.mode = "fast";
    });
    openMenu();
    choose("Restart");
    expect(state().boot.stage).toBe("restarting");
    expect(state().boot.mode).toBe("full");
    expect(state().shell.openPopover).toBeNull();
  });
});

describe("Power Off shuts down", () => {
  it("starts the shutdown", () => {
    openMenu();
    choose("Power Off");
    expect(state().boot.stage).toBe("shutting-down");
    expect(state().shell.openPopover).toBeNull();
  });
});
