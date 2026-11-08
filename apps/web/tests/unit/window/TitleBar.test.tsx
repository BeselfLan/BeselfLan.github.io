import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { os } from "@/os/store";
import {
  buttonNames,
  mountLayer,
  open,
  ptr,
  register,
  setupBrowser,
  teardownBrowser,
  titleBarOf,
  windowState,
  type TestApp,
} from "./mountLayer";

let setPointerCapture: ReturnType<typeof setupBrowser>["setPointerCapture"];

function mount(app: Partial<TestApp> = {}, browser = {}) {
  ({ setPointerCapture } = setupBrowser(browser));
  register({ id: "a", ...app });
  const result = mountLayer();
  open("a");
  return result;
}

// mount() sets the browser up itself, so a test can choose fullscreen.
afterEach(teardownBrowser);

const click = (name: string) => {
  const button = titleBarOf("a")!.querySelector(`[aria-label="${name}"]`)!;
  fireEvent.click(button);
};

describe("the title bar buttons", () => {
  it("follow D19", () => {
    mount({ maximize: true });
    expect(buttonNames("a")).toEqual(["Minimise", "Maximise", "Close"]);
    // Centred on the bar, not on the space beside the buttons.
    const title = titleBarOf("a")!.querySelector("h2")!;
    expect(title.parentElement).toBe(titleBarOf("a"));
    for (const c of ["absolute", "inset-x-0", "text-center"]) {
      expect(title.classList.contains(c)).toBe(true);
    }
  });

  it("drop Maximise when the app cannot maximise", () => {
    mount({ maximize: false });
    expect(buttonNames("a")).toEqual(["Minimise", "Close"]);
  });

  it.each([
    [{ minimize: false }, ["Close"]],
    [{ close: false }, ["Minimise"]],
    [{ minimize: false, close: false, maximize: true }, ["Maximise"]],
  ])("come from capabilities: %j", (app, names) => {
    mount(app);
    expect(buttonNames("a")).toEqual(names);
  });

  it("hide Maximise in fullscreen", () => {
    mount({ maximize: true }, { fullscreen: true });
    expect(buttonNames("a")).toEqual(["Minimise", "Close"]);
  });

  it("are Minimise and Close for an app the caller does not know", () => {
    mount({ unknownChrome: true, maximize: true });
    expect(buttonNames("a")).toEqual(["Minimise", "Close"]);
  });

  it("do what they say", () => {
    mount({ maximize: true });
    click("Minimise");
    expect(windowState("a")?.status).toBe("minimized");
    act(() => os.windows.restoreWindow("a"));

    click("Maximise");
    expect(windowState("a")?.maximized).toBe(true);
    expect(buttonNames("a")[1]).toBe("Restore");
    click("Restore");
    expect(windowState("a")?.maximized).toBe(false);
    expect(buttonNames("a")[1]).toBe("Maximise");

    click("Close");
    expect(windowState("a")).toBeUndefined();
  });
});

describe("the title bar", () => {
  it("double-click toggles maximise only when capable", () => {
    mount({ maximize: true });
    const bar = titleBarOf("a")!;
    fireEvent.doubleClick(bar);
    expect(windowState("a")?.maximized).toBe(true);
    fireEvent.doubleClick(bar);
    expect(windowState("a")?.maximized).toBe(false);
  });

  it("double-click does nothing when the app cannot maximise", () => {
    mount({ maximize: false });
    const toggle = vi.spyOn(os.windows, "toggleMaximize");
    fireEvent.doubleClick(titleBarOf("a")!);
    expect(toggle).not.toHaveBeenCalled();
    expect(windowState("a")?.maximized).toBe(false);
  });

  it("a button press is not a drag", () => {
    mount({ maximize: true });
    const toggle = vi.spyOn(os.windows, "toggleMaximize");
    const bar = titleBarOf("a")!;

    // The control: the bar itself starts a drag.
    fireEvent.pointerDown(bar, ptr());
    expect(setPointerCapture).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(bar, ptr());
    setPointerCapture.mockClear();

    const close = bar.querySelector('[aria-label="Close"]')!;
    fireEvent.pointerDown(close, ptr());
    expect(setPointerCapture).not.toHaveBeenCalled();

    const minimise = bar.querySelector('[aria-label="Minimise"]')!;
    fireEvent.doubleClick(minimise);
    expect(toggle).not.toHaveBeenCalled();
    expect(windowState("a")?.maximized).toBe(false);
  });

  it("has touch-action none and no text selection", () => {
    mount();
    const bar = titleBarOf("a")!;
    expect(bar.style.touchAction).toBe("none");
    expect(bar.style.userSelect).toBe("none");
  });

  it("shows the title and follows setTitle", () => {
    mount();
    expect(titleBarOf("a")!.querySelector("h2")?.textContent).toBe("a");
    act(() => os.windows.setTitle("a", "Renamed"));
    expect(titleBarOf("a")!.querySelector("h2")?.textContent).toBe("Renamed");
  });

  it("dims the title when the window is not focused", () => {
    setPointerCapture = setupBrowser().setPointerCapture;
    register({ id: "a" }, { id: "b", at: { x: 400, y: 250 } });
    mountLayer();
    open("a");
    open("b");
    const dim = (id: string) =>
      titleBarOf(id)!
        .querySelector("h2")!
        .classList.contains("text-os-panel-fg/60");
    expect(dim("b")).toBe(false);
    expect(dim("a")).toBe(true);
  });

  it("chrome: 'none' skips the title bar", () => {
    mount({ chrome: "none" });
    expect(titleBarOf("a")).toBeNull();
    const dialog = screen.getByRole("dialog", { name: "a" });
    const surface = dialog.firstElementChild!;
    expect(surface.children).toHaveLength(1);
    expect(surface.firstElementChild?.hasAttribute("data-window-content")).toBe(
      true,
    );
  });
});
