import { act, fireEvent, render, screen } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appLookup } from "@/os/apps/registry";
import { installShortcuts } from "@/os/input/shortcuts";
import { Screen } from "@/os/screen/Screen";
import { focusedWindow, os, useOS } from "@/os/store";
import { WindowLayer } from "@/os/window/WindowLayer";
import {
  chromeOf,
  register,
  setupBrowser,
  teardownBrowser,
  windowState,
} from "../../../tests/unit/window/mountLayer";
import { AltTab } from "./AltTab";

// The switcher inside a Screen, with the real keyboard registry installed and
// the real apps' definitions (their components are never rendered here). Keys
// go to the body and bubble up to the window, as a browser's would.

let uninstall: () => void;

beforeEach(() => {
  setupBrowser();
  os.windows.setAppLookup(appLookup);
  uninstall = installShortcuts();
});
afterEach(() => {
  uninstall();
  teardownBrowser();
});

const mount = () =>
  render(
    <Screen>
      <AltTab />
    </Screen>,
  );

function open(...ids: string[]) {
  act(() => {
    for (const id of ids) os.windows.openApp(id);
  });
}
const focusedId = () => focusedWindow(useOS.getState())?.id;
const strip = () => document.querySelector<HTMLElement>("[data-alt-tab]");
const options = () => screen.queryAllByRole("option");
const titles = () => options().map((o) => o.textContent);
const selectedTitle = () =>
  options().find((o) => o.getAttribute("aria-selected") === "true")
    ?.textContent;
const index = () => useOS.getState().shell.altTabIndex;

const altTab = (over: KeyboardEventInit = {}) =>
  fireEvent.keyDown(document.body, { key: "Tab", altKey: true, ...over });
const releaseAlt = () => fireEvent.keyUp(document.body, { key: "Alt" });

describe("Alt+Tab", () => {
  it("renders nothing while closed, however the windows change", () => {
    let commits = 0;
    render(
      <Screen>
        <Profiler id="alt-tab" onRender={() => void commits++}>
          <AltTab />
        </Profiler>
      </Screen>,
    );
    open("hello", "about");
    const before = commits;
    // A drag moves a window on every frame.
    act(() => os.windows.moveWindow("hello", { x: 10, y: 20 }));
    act(() => os.windows.moveWindow("hello", { x: 30, y: 40 }));
    expect(commits).toBe(before);
  });

  it("opens on the next window and commits on release", () => {
    mount();
    open("hello", "about", "projects");
    expect(focusedId()).toBe("projects");

    altTab();
    expect(strip()).not.toBeNull();
    expect(screen.getByRole("listbox", { name: "Switch windows" })).toBe(
      strip(),
    );
    expect(titles()).toEqual(["Projects", "About", "Hello"]);
    expect(selectedTitle()).toBe("About");
    expect(index()).toBe(1);
    // Nothing is committed on keydown, as #64's cycleFocus default does.
    expect(focusedId()).toBe("projects");
    // The icon comes from the app's definition.
    const hello = options()[2];
    expect(hello.querySelector("img")?.getAttribute("src")).toBe(
      "/icons/apps/hello.svg",
    );

    altTab();
    expect(selectedTitle()).toBe("Hello");
    expect(index()).toBe(2);
    expect(focusedId()).toBe("projects");

    releaseAlt();
    expect(focusedId()).toBe("hello");
    expect(strip()).toBeNull();
    expect(index()).toBe(0);
  });

  it("wraps round past the last window", () => {
    mount();
    open("hello", "about", "projects");
    altTab();
    altTab();
    altTab();
    expect(selectedTitle()).toBe("Projects");
    expect(index()).toBe(0);
    releaseAlt();
    expect(focusedId()).toBe("projects");
  });

  it("Shift+Tab goes back, and Alt+Shift+Tab starts from the end", () => {
    mount();
    open("hello", "about", "projects");
    altTab({ shiftKey: true });
    expect(selectedTitle()).toBe("Hello");
    expect(index()).toBe(2);

    altTab({ shiftKey: true });
    expect(selectedTitle()).toBe("About");
    altTab();
    expect(selectedTitle()).toBe("Hello");
    releaseAlt();
    expect(focusedId()).toBe("hello");
  });

  it("brings a minimised window back", () => {
    mount();
    open("hello", "about", "projects");
    act(() => os.windows.minimizeWindow("hello"));
    expect(windowState("hello")?.status).toBe("minimized");

    altTab();
    altTab();
    // Hello is listed, marked, and chosen.
    expect(selectedTitle()).toBe("Hello");
    expect(options()[2].hasAttribute("data-minimized")).toBe(true);
    releaseAlt();

    expect(windowState("hello")?.status).toBe("open");
    expect(focusedId()).toBe("hello");
  });

  it("brings back the window that was just minimised", () => {
    mount();
    open("hello", "about", "projects");
    act(() => os.windows.minimizeWindow("projects"));
    // About is focused, though Projects has the highest z.
    expect(focusedId()).toBe("about");

    altTab();
    // The focused window is first, so one press picks Projects. A plain z sort
    // would pick About, which already has focus, and a quick Alt+Tab would do
    // nothing.
    expect(titles()).toEqual(["About", "Projects", "Hello"]);
    expect(selectedTitle()).toBe("Projects");
    releaseAlt();
    expect(windowState("projects")?.status).toBe("open");
    expect(focusedId()).toBe("projects");
  });

  it("starts at the first window when every window is minimised", () => {
    mount();
    open("hello", "about");
    act(() => os.windows.minimizeAll());
    expect(focusedId()).toBeUndefined();

    altTab();
    expect(selectedTitle()).toBe("About");
    releaseAlt();
    expect(windowState("about")?.status).toBe("open");
    expect(focusedId()).toBe("about");
  });

  it("shows a single window, and a release focuses it", () => {
    mount();
    open("hello");
    altTab();
    expect(titles()).toEqual(["Hello"]);
    expect(selectedTitle()).toBe("Hello");
    releaseAlt();
    expect(focusedId()).toBe("hello");
    expect(strip()).toBeNull();
  });

  it("closes the App Grid on the first press", () => {
    mount();
    open("hello", "about");
    act(() => os.shell.setActivitiesOpen(true));
    altTab();
    expect(useOS.getState().shell.activitiesOpen).toBe(false);
    expect(strip()).not.toBeNull();
  });

  it("has nothing to switch with no windows", () => {
    mount();
    altTab();
    expect(strip()).toBeNull();
    expect(index()).toBe(0);
    // And a release does nothing.
    releaseAlt();
    expect(strip()).toBeNull();
  });

  it("cancels on Escape, leaving the focus alone", () => {
    mount();
    open("hello", "about", "projects");
    altTab();
    expect(strip()).not.toBeNull();

    // A bubble listener on the window never sees it: the strip stops it, so
    // the registry's Escape (close the grid and the menus) does not run too.
    let seen = false;
    const spy = () => {
      seen = true;
    };
    window.addEventListener("keydown", spy);
    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      document.body.dispatchEvent(escape);
    });
    window.removeEventListener("keydown", spy);

    expect(escape.defaultPrevented).toBe(true);
    expect(seen).toBe(false);
    expect(strip()).toBeNull();
    expect(index()).toBe(0);
    expect(focusedId()).toBe("projects");

    // The listeners are gone: a release now changes nothing, and is left alone
    // (true means nobody prevented it).
    expect(releaseAlt()).toBe(true);
    expect(focusedId()).toBe("projects");
  });

  it("cancels when the browser window loses focus", () => {
    mount();
    open("hello", "about", "projects");
    altTab();
    act(() => {
      window.dispatchEvent(new FocusEvent("blur"));
    });
    expect(strip()).toBeNull();
    expect(focusedId()).toBe("projects");
    releaseAlt();
    expect(focusedId()).toBe("projects");
  });

  it("is not cancelled by focus moving between elements", () => {
    mount();
    open("hello", "about", "projects");
    const one = document.body.appendChild(document.createElement("button"));
    const two = document.body.appendChild(document.createElement("button"));
    altTab();

    // blur does not bubble, but a capture listener on the window would hear
    // these, and close the strip on the first focus move (the App Grid's
    // cleanup moves focus when the first press closes it).
    act(() => one.focus());
    act(() => two.focus());
    expect(strip()).not.toBeNull();
    expect(selectedTitle()).toBe("About");
    one.remove();
    two.remove();
  });

  it("picks the option that is clicked", () => {
    mount();
    open("hello", "about", "projects");
    altTab();
    fireEvent.click(screen.getByRole("option", { name: /About/ }));
    expect(focusedId()).toBe("about");
    expect(strip()).toBeNull();
    expect(index()).toBe(0);
  });

  it("leaves a window out once it has closed, and ignores it", () => {
    mount();
    open("hello", "about", "projects");
    altTab();
    expect(titles()).toEqual(["Projects", "About", "Hello"]);
    act(() => void os.windows.closeWindow("about"));
    // The closing window is gone from the store at once.
    expect(titles()).toEqual(["Projects", "Hello"]);
    // The selection was About's slot; releasing focuses nothing that is gone.
    expect(() => releaseAlt()).not.toThrow();
    expect(strip()).toBeNull();
  });
});

describe("Alt+Tab and the keyboard", () => {
  it("gives the keys back on unmount", () => {
    const { unmount } = mount();
    open("hello", "about");
    expect(focusedId()).toBe("about");
    unmount();

    // The default cycles at once, on keydown, as before.
    altTab();
    expect(focusedId()).toBe("hello");
    expect(document.querySelector("[data-alt-tab]")).toBeNull();
  });

  it("ends a session on unmount, and stops listening", () => {
    const { unmount } = mount();
    open("hello", "about", "projects");
    altTab();
    expect(index()).toBe(1);
    unmount();
    expect(index()).toBe(0);

    releaseAlt();
    expect(focusedId()).toBe("projects");
  });

  it("moves keyboard focus into the chosen window", () => {
    register({ id: "a" }, { id: "b" });
    os.windows.setAppLookup((id) =>
      id === "a" || id === "b"
        ? {
            id,
            name: id,
            window: { width: 300, height: 200 },
            capabilities: { maximize: false },
            singleton: true,
          }
        : undefined,
    );
    const content = (id: string) => <button>{`${id}-button`}</button>;
    render(
      <Screen>
        <WindowLayer chromeOf={chromeOf} renderContent={content} />
        <AltTab />
      </Screen>,
    );
    open("a", "b");
    act(() => screen.getByRole("button", { name: "b-button" }).focus());
    expect(focusedId()).toBe("b");

    altTab();
    releaseAlt();

    expect(focusedId()).toBe("a");
    // DOM focus followed: without it the next Tab would walk b, and typing
    // would go to a window that is behind.
    const frame = document.querySelector('[data-window-id="a"]')!;
    expect(frame.contains(document.activeElement)).toBe(true);
  });
});
