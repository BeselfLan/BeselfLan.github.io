import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Screen } from "@/os/screen/Screen";
import { os, useOS } from "@/os/store";
import {
  setupBrowser,
  teardownBrowser,
} from "../../../tests/unit/window/mountLayer";
import { Notifications } from "./Notifications";
import { MAX_TOASTS, TOAST_MS } from "./toasts";

// The toasts inside the real Screen. Only the timers and the clock are faked:
// `until` is read from Date.now(). Motion stays at its initial pose in jsdom,
// so these tests read text and data attributes, never opacity.

beforeEach(() => {
  setupBrowser();
  sessionStorage.clear();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
});
afterEach(() => {
  vi.useRealTimers();
  teardownBrowser();
});

const mount = () =>
  render(
    <Screen>
      <Notifications />
    </Screen>,
  );

// The notification ids come from a counter that nothing resets, so a test
// reads the id that push returns and never writes one by hand.
function push(n: { title: string; body?: string; icon?: string }): string {
  let id = "";
  act(() => {
    id = os.notifications.push(n);
  });
  return id;
}
const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
const toastIds = () =>
  [...document.querySelectorAll<HTMLElement>("[data-toast]")].map(
    (el) => el.dataset.toast,
  );
const toastOf = (id: string) =>
  document.querySelector<HTMLElement>(`[data-toast="${id}"]`);
const stored = () => useOS.getState().notifications.items.map((n) => n.id);

describe("Notifications", () => {
  it("shows an item pushed after mount as a toast, and nothing from before", () => {
    // Already in the store when the desktop first mounts: never toasts.
    const old = push({ title: "Old", body: "old body" });
    const { unmount } = mount();
    expect(toastIds()).toEqual([]);

    const id = push({ title: "A", body: "a" });
    expect(toastIds()).toEqual([id]);
    const paragraphs = [...toastOf(id)!.querySelectorAll("p")].map(
      (p) => p.textContent,
    );
    expect(paragraphs).toEqual(["A", "a"]);

    // A Restart remounts the desktop: the notifications in the store, A and
    // Old, are not replayed.
    unmount();
    mount();
    expect(stored()).toEqual([old, id]);
    expect(toastIds()).toEqual([]);
  });

  it("draws the title alone when there is no body", () => {
    mount();
    const id = push({ title: "Only a title" });
    expect(toastOf(id)!.querySelectorAll("p")).toHaveLength(1);
  });

  it("leaves at 4 s and stays in the store", () => {
    mount();
    const id = push({ title: "A" });
    expect(TOAST_MS).toBe(4000);
    wait(3999);
    expect(toastIds()).toEqual([id]);
    wait(2);
    expect(toastIds()).toEqual([]);
    // The calendar's list reads the store, so the item must stay in it.
    expect(stored()).toEqual([id]);
  });

  it("keeps each toast's own time", () => {
    mount();
    const a = push({ title: "A" });
    wait(2000);
    const b = push({ title: "B" });
    expect(toastIds()).toEqual([b, a]);

    wait(2001);
    expect(toastIds()).toEqual([b]);
    wait(2000);
    expect(toastIds()).toEqual([]);
    expect(stored()).toEqual([a, b]);
  });

  it("shows at most three, newest first", () => {
    mount();
    expect(MAX_TOASTS).toBe(3);
    const ids: string[] = [];
    for (const title of ["A", "B", "C", "D"]) {
      ids.push(push({ title }));
      wait(250);
    }
    const [a, b, c, d] = ids;
    // DOM order is newest first. A is gone at once, and is still in the store.
    expect(toastIds()).toEqual([d, c, b]);
    expect(stored()).toEqual([a, b, c, d]);

    // No queue: A never comes back when the others leave.
    for (let t = 0; t < 6000; t += 500) {
      wait(500);
      expect(toastIds()).not.toContain(a);
    }
    expect(toastIds()).toEqual([]);
  });

  it("hides only the toast", () => {
    mount();
    const a = push({ title: "A" });
    const b = push({ title: "B" });
    fireEvent.click(screen.getByRole("button", { name: "Hide A" }));
    expect(toastIds()).toEqual([b]);
    expect(stored()).toEqual([a, b]);

    // Its timer went with it: nothing is left to fire.
    wait(4001);
    expect(toastIds()).toEqual([]);
    expect(stored()).toEqual([a, b]);
  });

  it("follows the store: dismiss removes that toast, clear removes every one", () => {
    mount();
    const a = push({ title: "A" });
    const b = push({ title: "B" });
    const c = push({ title: "C" });
    expect(toastIds()).toEqual([c, b, a]);

    act(() => os.notifications.dismiss(b));
    expect(toastIds()).toEqual([c, a]);

    act(() => os.notifications.clear());
    expect(toastIds()).toEqual([]);
    expect(stored()).toEqual([]);
    // The timers were cleared with the toasts.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is a polite region, rendered before anything is pushed", () => {
    mount();
    const region = document.querySelector("[data-toasts]");
    expect(region).not.toBeNull();
    expect(region?.querySelectorAll("[data-toast]")).toHaveLength(0);
    expect(region?.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByRole("region", { name: "New notifications" })).toBe(
      region,
    );
    push({ title: "A" });
    expect(document.querySelectorAll("[data-toasts]")).toHaveLength(1);
    expect(region?.querySelectorAll("[data-toast]")).toHaveLength(1);
  });

  it("loads no icon", () => {
    mount();
    const id = push({ title: "I", icon: "/nope.svg" });
    const toast = toastOf(id)!;
    expect(toast.querySelector("img")).toBeNull();
    expect(toast.innerHTML).not.toContain("nope.svg");
    // Only the Hide button's own inline icon is in the toast.
    expect(toast.querySelectorAll("svg")).toHaveLength(1);
  });

  it("shows an item pushed between render and subscribe", () => {
    // Sibling effects run in order, so this one pushes before the toasts'
    // effect subscribes to the store.
    function Pusher() {
      useEffect(() => {
        os.notifications.push({ title: "Early" });
      }, []);
      return null;
    }
    render(
      <Screen>
        <Pusher />
        <Notifications />
      </Screen>,
    );
    expect(document.querySelectorAll("[data-toast]")).toHaveLength(1);
    expect(document.querySelector("[data-toast]")?.textContent).toContain(
      "Early",
    );
  });

  it("still leaves at 4 s under Strict Mode", () => {
    // The toast is shown by the first effect run, and Strict Mode then stops
    // and starts the effect again. The push happens once only.
    let pushed = false;
    function Pusher() {
      useEffect(() => {
        if (pushed) return;
        pushed = true;
        os.notifications.push({ title: "A" });
      }, []);
      return null;
    }
    render(
      <StrictMode>
        <Screen>
          <Pusher />
          <Notifications />
        </Screen>
      </StrictMode>,
    );
    expect(pushed).toBe(true);
    expect(document.querySelectorAll("[data-toast]")).toHaveLength(1);
    wait(3999);
    expect(document.querySelectorAll("[data-toast]")).toHaveLength(1);
    expect(document.querySelector("[data-toast]")?.textContent).toContain("A");
    wait(2);
    expect(document.querySelectorAll("[data-toast]")).toHaveLength(0);
  });

  it("shows a toast pushed after mount once, under Strict Mode", () => {
    render(
      <StrictMode>
        <Screen>
          <Notifications />
        </Screen>
      </StrictMode>,
    );
    const id = push({ title: "A" });
    expect(toastIds()).toEqual([id]);
    wait(4001);
    expect(toastIds()).toEqual([]);
  });

  it("never takes focus", () => {
    render(
      <Screen>
        <button>Before</button>
        <Notifications />
      </Screen>,
    );
    const before = screen.getByRole("button", { name: "Before" });
    act(() => before.focus());
    expect(document.activeElement).toBe(before);

    push({ title: "A" });
    expect(document.activeElement).toBe(before);
    wait(4001);
    expect(document.activeElement).toBe(before);
  });
});
