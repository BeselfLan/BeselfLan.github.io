import { StrictMode } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appLookup } from "@/os/apps/registry";
import { installShortcuts } from "@/os/input/shortcuts";
import { Screen } from "@/os/screen/Screen";
import { focusedWindow, os, useOS } from "@/os/store";
import {
  setupBrowser,
  teardownBrowser,
} from "../../../tests/unit/window/mountLayer";
import { AppGrid, type AppGridMode } from "./AppGrid";

// Shortcuts installed by a test come off in afterEach.
let uninstall: (() => void) | null = null;

beforeEach(() => {
  setupBrowser();
  // setupBrowser installs a test lookup; these tests open the real apps.
  os.windows.setAppLookup(appLookup);
});
afterEach(() => {
  uninstall?.();
  uninstall = null;
  teardownBrowser();
});

function mount(mode?: AppGridMode, strict = false) {
  const tree = (
    <Screen>
      <button type="button">outside</button>
      <AppGrid mode={mode} />
    </Screen>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

const root = () => document.getElementById("desktop-app-grid")!;
const shell = () => useOS.getState().shell;
const openIds = () => useOS.getState().windows.items.map((w) => w.id);
const setOpen = (open: boolean) => act(() => os.shell.setActivitiesOpen(open));
const dialog = () => screen.getByRole("dialog", { name: "Applications" });
const searchbox = () => screen.getByRole("searchbox", { name: "Search apps" });
const tileNames = () =>
  within(dialog())
    .getAllByRole("button")
    .map((b) => b.textContent);
const type = (text: string) =>
  fireEvent.change(searchbox(), { target: { value: text } });
const enter = (init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(searchbox(), { key: "Enter", ...init });
const outside = () => screen.getByRole("button", { name: "outside" });

describe("AppGrid", () => {
  it("is closed until Activities opens it", () => {
    mount();
    expect(root()).not.toBeNull();
    expect(root().hidden).toBe(true);
    expect(root().hasAttribute("data-app-grid")).toBe(true);
    // Nothing is mounted behind the hidden root.
    expect(root().childElementCount).toBe(0);
    expect(screen.queryByRole("searchbox")).toBeNull();

    setOpen(true);
    expect(root().hidden).toBe(false);
    expect(dialog().getAttribute("aria-modal")).toBe("true");
    expect(root().contains(dialog())).toBe(true);
    // The field has focus, so typing needs no click.
    expect(document.activeElement).toBe(searchbox());
    expect(tileNames()).toEqual(["Projects", "Skills", "About", "Hello"]);
  });

  it("draws one tile per app with its icon and its name", () => {
    mount();
    setOpen(true);
    for (const id of ["projects", "skills", "about", "hello"]) {
      const tile = dialog().querySelector<HTMLElement>(
        `[data-app-grid-tile="${id}"]`,
      )!;
      expect(tile.tagName).toBe("BUTTON");
      const img = tile.querySelector("img")!;
      expect(img.getAttribute("src")).toBe(`/icons/apps/${id}.svg`);
      expect(img.getAttribute("width")).toBe("72");
    }
    // The video player is not an app of the grid.
    expect(screen.queryByRole("button", { name: "Video Player" })).toBeNull();
  });

  it("filters the tiles as you type", () => {
    mount();
    setOpen(true);
    type("ski");
    expect(tileNames()).toEqual(["Skills"]);
    type("zzz");
    expect(within(dialog()).queryAllByRole("button")).toHaveLength(0);
    type("");
    expect(tileNames()).toEqual(["Projects", "Skills", "About", "Hello"]);
  });

  it("launches the first match on Enter and closes", () => {
    mount();
    setOpen(true);
    type("ski");
    expect(tileNames()).toEqual(["Skills"]);

    enter();
    expect(openIds()).toEqual(["skills"]);
    expect(shell().activitiesOpen).toBe(false);
    expect(root().hidden).toBe(true);
  });

  it("launches nothing on Enter when no app matches, and stays open", () => {
    mount();
    setOpen(true);
    type("zzz");
    enter();
    expect(openIds()).toEqual([]);
    expect(shell().activitiesOpen).toBe(true);
    expect(root().hidden).toBe(false);
  });

  it("ignores an Enter that picks an IME candidate, and other keys", () => {
    mount();
    setOpen(true);
    type("ski");
    enter({ isComposing: true });
    fireEvent.keyDown(searchbox(), { key: "a" });
    expect(openIds()).toEqual([]);
    expect(shell().activitiesOpen).toBe(true);
  });

  it("launches and closes on a tile click", () => {
    mount();
    setOpen(true);
    fireEvent.click(screen.getByRole("button", { name: "About" }));
    expect(openIds()).toEqual(["about"]);
    expect(focusedWindow(useOS.getState())?.appId).toBe("about");
    expect(shell().activitiesOpen).toBe(false);
    expect(root().hidden).toBe(true);
  });

  it("closes on a backdrop press without launching, and stays on the field", () => {
    mount();
    setOpen(true);
    fireEvent.click(dialog());
    expect(openIds()).toEqual([]);
    expect(shell().activitiesOpen).toBe(false);

    // A press on the search field is not a press on the backdrop.
    setOpen(true);
    fireEvent.click(searchbox());
    expect(shell().activitiesOpen).toBe(true);

    // The gap between the tiles is backdrop.
    const tiles = screen.getByRole("button", {
      name: "Projects",
    }).parentElement!;
    fireEvent.click(tiles);
    expect(shell().activitiesOpen).toBe(false);
    expect(openIds()).toEqual([]);
  });

  it("closes on Esc from the search field", () => {
    uninstall = installShortcuts();
    mount();
    setOpen(true);
    expect(document.activeElement).toBe(searchbox());
    // With text in the field, so a typing guard on Escape would be caught.
    type("ski");
    fireEvent.keyDown(searchbox(), { key: "Escape" });
    expect(shell().activitiesOpen).toBe(false);
    expect(root().hidden).toBe(true);
  });

  it("closes on Super from the search field", () => {
    uninstall = installShortcuts();
    mount();
    setOpen(true);
    fireEvent.keyDown(searchbox(), { key: "Meta", metaKey: true });
    fireEvent.keyUp(searchbox(), { key: "Meta" });
    expect(shell().activitiesOpen).toBe(false);
  });

  it("starts every open with an empty search", () => {
    mount();
    setOpen(true);
    type("ski");
    expect((searchbox() as HTMLInputElement).value).toBe("ski");

    setOpen(false);
    setOpen(true);
    expect((searchbox() as HTMLInputElement).value).toBe("");
    expect(tileNames()).toEqual(["Projects", "Skills", "About", "Hello"]);
  });

  it.each([false, true])(
    "gives focus back to what had it, strict mode %s",
    (strict) => {
      uninstall = installShortcuts();
      mount(undefined, strict);
      outside().focus();
      expect(document.activeElement).toBe(outside());

      setOpen(true);
      expect(document.activeElement).toBe(searchbox());

      fireEvent.keyDown(searchbox(), { key: "Escape" });
      expect(shell().activitiesOpen).toBe(false);
      expect(document.activeElement).toBe(outside());
    },
  );

  it("shows the apps grid in windows mode until thumbnails exist", () => {
    mount("windows");
    setOpen(true);
    expect(root().getAttribute("data-mode")).toBe("windows");
    expect(tileNames()).toEqual(["Projects", "Skills", "About", "Hello"]);
  });
});
