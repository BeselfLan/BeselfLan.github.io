import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MotionConfig } from "motion/react";
import { Profiler, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { staticContent } from "@/content/static";
import type { AppApi } from "@/os/apps/types";
import { WindowIdContext } from "@/os/window/useWindowVisible";
import type { SkillsArgs } from "./index";
import SkillsApp from "./SkillsApp";

// The component with an api of vi.fn()s and the real content. It renders
// outside a Screen, as registry.test.ts does, and imports nothing from
// os/store: the lint rule keeps apps away from it. The clock is fake (the
// stage loop asks for requestAnimationFrame), so a test steps the frames by
// hand. jsdom has no layout, so every rectangle is zero and the stage's
// pointer maths gives client pixels as stage units.

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"],
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const tick = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
const frames = (n: number) => {
  for (let i = 0; i < n; i++) tick(16);
};

function makeApi() {
  let onVisible: (visible: boolean) => void = () => {};
  const mocks = {
    close: vi.fn(),
    minimize: vi.fn(),
    focus: vi.fn(),
    setTitle: vi.fn(),
    openApp: vi.fn(),
    notify: vi.fn(),
    isVisible: vi.fn(() => true),
    subscribeVisible: vi.fn<AppApi["subscribeVisible"]>((cb) => {
      onVisible = cb;
      return () => {};
    }),
    bounds: vi.fn(() => ({ width: 1000, height: 580 })),
    registerShortcut: vi.fn(() => () => {}),
  };
  const api = {
    ...mocks,
    content: staticContent,
    media: { status: () => "unknown", resolve: vi.fn() },
  } as unknown as AppApi;
  return { api, mocks, setVisible: (v: boolean) => onVisible(v) };
}

const ui = (api: AppApi, args: SkillsArgs = {}): ReactElement => (
  <WindowIdContext value="skills">
    <SkillsApp windowId="skills" args={args} api={api} />
  </WindowIdContext>
);

// Taken before any test renders, so a test that sorts the shared list in place
// cannot change what it is compared with.
const PRACTICES = staticContent
  .skills()
  .filter((s) => s.category === "practice");
const BEFORE = {
  all: staticContent
    .skills()
    .filter((s) => s.category !== "practice")
    .map((s) => s.id),
  practiceIds: PRACTICES.map((s) => s.id),
  practiceNames: PRACTICES.map((s) => s.name),
};

const chip = (name: string) =>
  within(screen.getByRole("group", { name: "Category" })).getByRole("button", {
    name,
  });
const press = (name: string) => fireEvent.click(chip(name));
const pressed = () =>
  Object.fromEntries(
    ["All", "Languages", "Frameworks", "Libraries", "Tools"].map((n) => [
      n,
      chip(n).getAttribute("aria-pressed"),
    ]),
  );
const icons = (c: HTMLElement) => [
  ...c.querySelectorAll<HTMLButtonElement>("[data-skill-id]"),
];
const ids = (c: HTMLElement) => icons(c).map((b) => b.dataset.skillId);
const icon = (c: HTMLElement, id: string) =>
  c.querySelector<HTMLButtonElement>(`[data-skill-id="${id}"]`)!;
const selected = (c: HTMLElement) =>
  [...c.querySelectorAll("[data-selected]")].map((e) =>
    e.getAttribute("data-skill-id"),
  );
// The corner a `translate3d(x, y, 0)` puts an icon at.
const at = (el: HTMLElement) => {
  const m = /^translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(el.style.transform);
  if (!m) throw new Error(`no transform: "${el.style.transform}"`);
  return { x: Number(m[1]), y: Number(m[2]) };
};

// Pointer events carry what the handlers read; jsdom's default isPrimary is
// false, and its button is 0.
const ev = (x: number, y: number, over: object = {}) => ({
  pointerId: 1,
  button: 0,
  isPrimary: true,
  clientX: x,
  clientY: y,
  ...over,
});
const down = (el: Element, x = 500, y = 250, over: object = {}) =>
  fireEvent.pointerDown(el, ev(x, y, over));
const move = (el: Element, x: number, y: number, over: object = {}) =>
  fireEvent.pointerMove(el, ev(x, y, over));
const up = (el: Element, x: number, y: number, over: object = {}) =>
  fireEvent.pointerUp(el, ev(x, y, over));
// A mouse click after a press: the browser sends it after pointerup.
const click = (el: Element) => fireEvent.click(el, { detail: 1 });
// A focus() outside a fireEvent is not inside act().
const focus = (el: HTMLElement) =>
  act(() => {
    el.focus();
  });

describe("SkillsApp", () => {
  it("keeps the Skills heading", () => {
    const { api } = makeApi();
    render(ui(api));
    const headings = screen.getAllByRole("heading", { name: /Skills/ });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toBe("Skills");
  });

  it("opens on All, with every skill but the practices", () => {
    const { api } = makeApi();
    const { container } = render(ui(api));
    expect(pressed()).toEqual({
      All: "true",
      Languages: "false",
      Frameworks: "false",
      Libraries: "false",
      Tools: "false",
    });
    expect(ids(container)).toEqual(BEFORE.all);
    expect(ids(container)).toHaveLength(45);
    expect(ids(container)[0]).toBe("python");
    expect(ids(container).at(-1)).toBe("sharepoint");
    for (const p of BEFORE.practiceIds) {
      expect(ids(container)).not.toContain(p);
    }
    for (const b of icons(container)) expect(b.tagName).toBe("BUTTON");
  });

  it("shows the four practices in the footer as labels, not buttons", () => {
    const { api } = makeApi();
    render(ui(api));
    expect(BEFORE.practiceNames).toHaveLength(4);
    for (const name of BEFORE.practiceNames) {
      const label = screen.getByText(name);
      expect(label.tagName).toBe("SPAN");
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.getByText("Practices")).toBeTruthy();
  });

  it("lists what each tab lists", () => {
    const { api } = makeApi();
    const { container } = render(ui(api));
    press("Tools");
    expect(ids(container)).toHaveLength(17);
    expect(ids(container)[0]).toBe("git");
    expect(chip("Tools").getAttribute("aria-pressed")).toBe("true");
    expect(chip("All").getAttribute("aria-pressed")).toBe("false");
    press("Languages");
    expect(ids(container)).toHaveLength(12);
    press("Frameworks");
    expect(ids(container)).toHaveLength(7);
    press("Libraries");
    expect(ids(container)).toHaveLength(9);
    press("All");
    expect(ids(container)).toEqual(BEFORE.all);
  });

  describe("the args", () => {
    it("selects the item and presses its tab", () => {
      const { api } = makeApi();
      const { container } = render(ui(api, { item: "git", tab: "tool" }));
      expect(pressed().Tools).toBe("true");
      expect(pressed().All).toBe("false");
      expect(ids(container)).toHaveLength(17);
      expect(selected(container)).toEqual(["git"]);
    });

    it("switches to All for an item the tab does not list", () => {
      const { api } = makeApi();
      const { container } = render(ui(api, { item: "python", tab: "tool" }));
      expect(pressed().All).toBe("true");
      expect(pressed().Tools).toBe("false");
      expect(selected(container)).toEqual(["python"]);
    });

    it("selects no icon for a practice, and keeps its tab", () => {
      const { api } = makeApi();
      const { container } = render(ui(api, { item: "oop", tab: "tool" }));
      expect(pressed().Tools).toBe("true");
      expect(ids(container)).toHaveLength(17);
      expect(selected(container)).toEqual([]);
    });

    it("selects nothing for an item that is not a skill", () => {
      const { api } = makeApi();
      const { container } = render(ui(api, { item: "nope" }));
      expect(selected(container)).toEqual([]);
      expect(container.querySelector("[data-selected]")).toBeNull();
    });

    it("applies new args that arrive in a re-render", () => {
      const { api } = makeApi();
      const view = render(ui(api, { item: "git", tab: "tool" }));
      view.rerender(ui(api, { item: "docker", tab: "tool" }));
      expect(pressed().Tools).toBe("true");
      expect(selected(view.container)).toEqual(["docker"]);

      // And over what the visitor chose in between.
      press("Languages");
      expect(selected(view.container)).toEqual([]);
      view.rerender(ui(api, { item: "git", tab: "tool" }));
      expect(pressed().Tools).toBe("true");
      expect(selected(view.container)).toEqual(["git"]);
    });

    it("keeps the visitor's view when the same args come again", () => {
      const { api } = makeApi();
      const A: SkillsArgs = {};
      const view = render(ui(api, A));
      press("Tools");
      click(icon(view.container, "git"));
      view.rerender(ui(api, A));
      expect(pressed().Tools).toBe("true");
      expect(pressed().All).toBe("false");
      expect(selected(view.container)).toEqual(["git"]);
    });
  });

  describe("the selection", () => {
    it("stays across a tab that lists it, and clears across one that does not", () => {
      const { api } = makeApi();
      const { container } = render(ui(api));
      click(icon(container, "git"));
      expect(selected(container)).toEqual(["git"]);
      press("Tools");
      expect(selected(container)).toEqual(["git"]);
      press("Languages");
      expect(selected(container)).toEqual([]);
      press("All");
      expect(selected(container)).toEqual([]);
    });

    it("keeps an icon selected when it is selected again", () => {
      const { api } = makeApi();
      const { container } = render(ui(api));
      click(icon(container, "python"));
      click(icon(container, "python"));
      expect(selected(container)).toEqual(["python"]);
      click(icon(container, "java"));
      expect(selected(container)).toEqual(["java"]);
    });
  });

  describe("the pointer", () => {
    it("selects on a click and not after a drag", () => {
      const { api } = makeApi();
      const { container } = render(ui(api));
      const python = icon(container, "python");
      const java = icon(container, "java");

      down(python);
      tick(10);
      up(python, 500, 250);
      click(python);
      expect(selected(container)).toEqual(["python"]);

      down(java);
      move(java, 550, 250);
      up(java, 550, 250);
      click(java);
      expect(selected(container)).toEqual(["python"]);
    });

    it("leaves the transform to the loop after a selection", () => {
      const { api } = makeApi();
      const { container } = render(ui(api));
      frames(2);
      const python = icon(container, "python");
      down(python);
      up(python, 500, 250);
      click(python);
      expect(selected(container)).toEqual(["python"]);
      for (const b of icons(container)) {
        expect(b.style.transform.startsWith("translate3d(")).toBe(true);
      }
    });

    it("swallows the click of a drag once, and only that one", () => {
      const { api } = makeApi();
      const { container } = render(ui(api));
      const java = icon(container, "java");
      down(java);
      move(java, 560, 250);
      up(java, 560, 250);
      click(java);
      expect(selected(container)).toEqual([]);
      // The next click is a click again.
      down(java);
      up(java, 500, 250);
      click(java);
      expect(selected(container)).toEqual(["java"]);
    });

    it("does not let a drag with no click after it eat a key press", () => {
      const { api } = makeApi();
      const { container } = render(ui(api));
      const java = icon(container, "java");
      down(java);
      move(java, 560, 250);
      up(java, 560, 250);
      // No click event follows, as when the release lands elsewhere.
      fireEvent.keyDown(java, { key: "Enter" });
      fireEvent.click(java, { detail: 0 });
      expect(selected(container)).toEqual(["java"]);
    });

    it("counts a drag that comes back to its start as a drag", () => {
      const { api } = makeApi();
      const { container } = render(ui(api));
      const java = icon(container, "java");
      down(java);
      move(java, 600, 250);
      move(java, 500, 250);
      up(java, 500, 250);
      click(java);
      expect(selected(container)).toEqual([]);
    });

    it("treats a press held for 250 ms as a drag, not a click", () => {
      const { api } = makeApi();
      const { container } = render(ui(api));
      const java = icon(container, "java");
      down(java);
      tick(250);
      up(java, 500, 250);
      click(java);
      expect(selected(container)).toEqual([]);

      down(java);
      tick(240);
      up(java, 500, 250);
      click(java);
      expect(selected(container)).toEqual(["java"]);
    });

    it("lets a small wobble stay a click", () => {
      const { api } = makeApi();
      const { container } = render(ui(api));
      const java = icon(container, "java");
      down(java);
      move(java, 502, 251);
      tick(20);
      up(java, 502, 251);
      click(java);
      expect(selected(container)).toEqual(["java"]);
    });

    it("ignores a press that is not the primary button of the primary pointer", () => {
      const { api } = makeApi();
      const { container } = render(ui(api));
      const java = icon(container, "java");
      // A drag by a right button or a second finger starts nothing, so no
      // click is swallowed afterwards.
      down(java, 500, 250, { button: 2 });
      move(java, 600, 250, { button: 2 });
      up(java, 600, 250, { button: 2 });
      down(java, 500, 250, { isPrimary: false });
      move(java, 600, 250, { isPrimary: false });
      up(java, 600, 250, { isPrimary: false });
      click(java);
      expect(selected(container)).toEqual(["java"]);
    });

    it("ignores the moves and the release of another pointer", () => {
      const { api } = makeApi();
      const { container } = render(ui(api));
      const java = icon(container, "java");
      down(java, 500, 250, { pointerId: 1 });
      move(java, 600, 250, { pointerId: 2 });
      up(java, 600, 250, { pointerId: 2 });
      // Still held: the stray release did not end the press.
      tick(10);
      up(java, 500, 250, { pointerId: 1 });
      click(java);
      expect(selected(container)).toEqual(["java"]);
    });

    it("lets go of a cancelled press without selecting", () => {
      const { api } = makeApi();
      const { container } = render(ui(api));
      const java = icon(container, "java");
      down(java);
      fireEvent.pointerCancel(java, ev(500, 250));
      click(java);
      expect(selected(container)).toEqual([]);
      // The press is over: a later release finds nothing to end.
      up(java, 500, 250);
      click(java);
      expect(selected(container)).toEqual(["java"]);
    });

    it("captures the pointer where the browser can", () => {
      const { api } = makeApi();
      const { container } = render(ui(api));
      const python = icon(container, "python");
      const capture = vi.fn();
      python.setPointerCapture = capture;
      down(python, 500, 250, { pointerId: 7 });
      expect(capture).toHaveBeenCalledWith(7);
    });

    it("moves the dragged icon with the pointer", () => {
      const { api } = makeApi();
      const { container } = render(ui(api));
      frames(3);
      const python = icon(container, "python");
      const before = at(python);
      // Towards the middle, so the target stays inside the walls.
      const dx = before.x < 400 ? 200 : -200;
      down(python, 500, 250);
      move(python, 500 + dx, 250);
      frames(3);
      const now = at(python);
      expect(Math.abs(now.x - (before.x + dx))).toBeLessThan(0.1);
      expect(Math.abs(now.y - before.y)).toBeLessThan(0.1);
      up(python, 500 + dx, 250);
    });

    it("flicks the icon on release with the speed of the drag", () => {
      // A fixed seed, so the layout is the same on every run.
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      const { api } = makeApi();
      const { container } = render(ui(api));
      frames(3);
      const python = icon(container, "python");
      const dx = at(python).x < 400 ? 1 : -1;
      down(python, 500, 250);
      // 10 units every 10 ms: 1000 units per second.
      for (let i = 1; i <= 4; i++) {
        tick(10);
        move(python, 500 + dx * 10 * i, 250);
      }
      tick(10);
      move(python, 500 + dx * 50, 250);
      up(python, 500 + dx * 50, 250);
      const released = at(python);
      // One frame: about 16 units at that speed, against well under 1 of drift.
      // (A longer flight meets a neighbour with this layout.)
      frames(1);
      const flown = at(python).x - released.x;
      expect(Math.abs(flown)).toBeGreaterThan(10);
      expect(Math.sign(flown)).toBe(dx);
    });

    it("does not flick an icon that was held still", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      const { api } = makeApi();
      const { container } = render(ui(api));
      frames(3);
      const python = icon(container, "python");
      down(python, 500, 250);
      move(python, 540, 250);
      frames(10);
      // Held at the end for longer than the tracker's window.
      tick(200);
      up(python, 540, 250);
      frames(1);
      const released = at(python);
      frames(5);
      expect(Math.abs(at(python).x - released.x)).toBeLessThan(10);
    });
  });

  describe("the keyboard", () => {
    it("has one tab stop, on the first icon", () => {
      const { api } = makeApi();
      const { container } = render(ui(api));
      const stops = icons(container).filter((b) => b.tabIndex === 0);
      expect(stops.map((b) => b.dataset.skillId)).toEqual(["python"]);
      for (const b of icons(container).slice(1)) expect(b.tabIndex).toBe(-1);
    });

    it("starts the tab stop on the selected icon when there is one", () => {
      const { api } = makeApi();
      const { container } = render(ui(api, { item: "git" }));
      const stops = icons(container).filter((b) => b.tabIndex === 0);
      expect(stops.map((b) => b.dataset.skillId)).toEqual(["git"]);
    });

    it("moves the focus and the tab stop with the arrow keys", () => {
      const { api } = makeApi();
      const { container } = render(ui(api));
      const python = icon(container, "python");
      const java = icon(container, "java");
      focus(python);
      expect(fireEvent.keyDown(python, { key: "ArrowRight" })).toBe(false);
      expect(document.activeElement).toBe(java);
      expect(java.tabIndex).toBe(0);
      expect(python.tabIndex).toBe(-1);

      fireEvent.keyDown(java, { key: "ArrowDown" });
      expect(document.activeElement).toBe(icons(container)[2]);
      fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
      expect(document.activeElement).toBe(java);
      fireEvent.keyDown(java, { key: "ArrowUp" });
      expect(document.activeElement).toBe(python);
    });

    it("wraps at both ends, and Home and End jump", () => {
      const { api } = makeApi();
      const { container } = render(ui(api));
      const all = icons(container);
      const first = all[0];
      const last = all[all.length - 1];
      focus(first);
      fireEvent.keyDown(first, { key: "ArrowLeft" });
      expect(document.activeElement).toBe(last);
      fireEvent.keyDown(last, { key: "ArrowRight" });
      expect(document.activeElement).toBe(first);

      fireEvent.keyDown(first, { key: "End" });
      expect(document.activeElement).toBe(last);
      expect(last.tabIndex).toBe(0);
      fireEvent.keyDown(last, { key: "Home" });
      expect(document.activeElement).toBe(first);
      expect(first.tabIndex).toBe(0);
      expect(last.tabIndex).toBe(-1);
    });

    it("leaves keys with a modifier, and other keys, alone", () => {
      const { api } = makeApi();
      const { container } = render(ui(api));
      const python = icon(container, "python");
      focus(python);
      for (const mod of ["ctrlKey", "altKey", "metaKey"]) {
        expect(
          fireEvent.keyDown(python, { key: "ArrowRight", [mod]: true }),
        ).toBe(true);
        expect(document.activeElement).toBe(python);
      }
      // Enter, Space, Escape and letters are not taken.
      for (const key of ["Enter", " ", "Escape", "a", "Tab"]) {
        expect(fireEvent.keyDown(python, { key })).toBe(true);
        expect(document.activeElement).toBe(python);
      }
    });

    it("keeps the tab stop where a click or a Tab put the focus", () => {
      const { api } = makeApi();
      const { container } = render(ui(api));
      const git = icon(container, "git");
      focus(git);
      expect(git.tabIndex).toBe(0);
      expect(icon(container, "python").tabIndex).toBe(-1);
      // Selecting another icon does not move it: the focus is where it was.
      click(icon(container, "java"));
      expect(git.tabIndex).toBe(0);
    });

    it("falls back to the first icon when the focused one leaves the stage", () => {
      const { api } = makeApi();
      const { container } = render(ui(api));
      focus(icon(container, "git"));
      press("Languages");
      expect(icons(container)[0].dataset.skillId).toBe("python");
      expect(icons(container).filter((b) => b.tabIndex === 0)).toHaveLength(1);
      expect(icons(container)[0].tabIndex).toBe(0);
    });

    it("selects with Enter and Space, which the browser turns into a click", () => {
      const { api } = makeApi();
      const { container } = render(ui(api));
      const java = icon(container, "java");
      // A key's click has detail 0, which is what fireEvent.click sends.
      fireEvent.click(java, { detail: 0 });
      expect(selected(container)).toEqual(["java"]);
      fireEvent.click(icon(container, "git"), { detail: 0 });
      expect(selected(container)).toEqual(["git"]);
    });

    it("names each icon after its skill", () => {
      const { api } = makeApi();
      render(ui(api));
      expect(screen.getByRole("button", { name: "Python" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Git" })).toBeTruthy();
    });
  });

  describe("the loop", () => {
    it("writes a translate3d to every icon after a frame", () => {
      const { api } = makeApi();
      const { container } = render(ui(api));
      frames(1);
      expect(icons(container)).toHaveLength(45);
      for (const b of icons(container)) {
        expect(b.style.transform.startsWith("translate3d(")).toBe(true);
      }
    });

    it("sets the size and nothing else of the transform in JSX", () => {
      const { api } = makeApi();
      const { container } = render(ui(api));
      for (const b of icons(container)) {
        expect(b.style.width).toBe("56px");
        expect(b.style.height).toBe("56px");
      }
    });

    it("renders no React commit per frame", () => {
      const { api } = makeApi();
      const onRender = vi.fn();
      const { container } = render(
        <Profiler id="skills" onRender={onRender}>
          {ui(api)}
        </Profiler>,
      );
      expect(onRender).toHaveBeenCalled();
      const before = icons(container).map((b) => b.style.transform);
      onRender.mockClear();
      frames(30);
      expect(onRender).not.toHaveBeenCalled();
      // The icons did move: the loop ran.
      expect(icons(container).map((b) => b.style.transform)).not.toEqual(
        before,
      );
    });

    it("stops while the window is hidden and runs again when it shows", () => {
      const { api, setVisible } = makeApi();
      render(ui(api));
      expect(vi.getTimerCount()).toBe(1);
      act(() => setVisible(false));
      expect(vi.getTimerCount()).toBe(0);
      act(() => setVisible(true));
      expect(vi.getTimerCount()).toBe(1);
    });

    it("stops for good when the app unmounts", () => {
      const { api } = makeApi();
      const view = render(ui(api));
      expect(vi.getTimerCount()).toBe(1);
      view.unmount();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("re-seeds the icons on a tab switch, with every icon placed at once", () => {
      const { api } = makeApi();
      const { container } = render(ui(api));
      frames(5);
      press("Tools");
      // No frame has run since the switch.
      expect(icons(container)).toHaveLength(17);
      for (const b of icons(container)) {
        expect(b.style.transform.startsWith("translate3d(")).toBe(true);
      }
    });
  });

  describe("the fade", () => {
    const set = (c: HTMLElement) =>
      c.querySelector<HTMLElement>(".skills-set")!;

    it("fades the new set in on a tab switch", () => {
      const { api } = makeApi();
      const { container } = render(ui(api));
      const first = set(container);
      expect(first.classList.contains("skills-set-enter")).toBe(true);
      press("Tools");
      // A new element, so the animation starts again.
      expect(set(container)).not.toBe(first);
      expect(set(container).classList.contains("skills-set-enter")).toBe(true);
    });

    it("keeps the same set while the tab stays", () => {
      const { api } = makeApi();
      const { container } = render(ui(api));
      const first = set(container);
      click(icon(container, "git"));
      press("All");
      expect(set(container)).toBe(first);
    });

    it("does not fade under reduced motion", () => {
      const { api } = makeApi();
      const { container } = render(
        <MotionConfig reducedMotion="always">{ui(api)}</MotionConfig>,
      );
      expect(set(container).classList.contains("skills-set")).toBe(true);
      expect(set(container).classList.contains("skills-set-enter")).toBe(false);
    });

    it("hands the stylesheet the hover scale and the fade length", () => {
      const { api } = makeApi();
      const { container } = render(ui(api));
      const stage = container.querySelector<HTMLElement>(
        "[data-skills-stage]",
      )!;
      expect(stage.style.getPropertyValue("--skills-hover-scale")).toBe("1.08");
      expect(stage.style.getPropertyValue("--skills-fade-ms")).toBe("150ms");
    });
  });

  describe("the radius", () => {
    const widths = (c: HTMLElement) => [
      ...new Set(icons(c).map((b) => b.style.width)),
    ];

    it("is 56 across, and 48 in the fullscreen mode", () => {
      const { api } = makeApi();
      const plain = render(ui(api));
      expect(widths(plain.container)).toEqual(["56px"]);
      plain.unmount();

      vi.stubGlobal("matchMedia", () => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }));
      const full = render(ui(api));
      expect(widths(full.container)).toEqual(["48px"]);
      for (const b of icons(full.container)) {
        expect(b.style.height).toBe("48px");
        expect(
          b.querySelector<HTMLElement>("[data-skill-icon]")!.style.width,
        ).toBe("48px");
      }
    });

    it("follows a change of the mode", () => {
      const { api } = makeApi();
      let listener: (() => void) | null = null;
      const list = {
        matches: false,
        addEventListener: vi.fn((type: string, cb: () => void) => {
          if (type === "change") listener = cb;
        }),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      };
      vi.stubGlobal("matchMedia", () => list);
      const { container } = render(ui(api));
      expect(widths(container)).toEqual(["56px"]);
      list.matches = true;
      act(() => listener?.());
      expect(widths(container)).toEqual(["48px"]);
    });
  });

  it("never writes its args, its title or the URL", () => {
    const { api, mocks } = makeApi();
    const { container } = render(ui(api, { item: "git", tab: "tool" }));
    press("All");
    press("Languages");
    click(icon(container, "python"));
    const java = icon(container, "java");
    down(java);
    move(java, 560, 250);
    up(java, 560, 250);
    click(java);
    fireEvent.keyDown(java, { key: "ArrowRight" });
    frames(5);
    for (const name of [
      "close",
      "minimize",
      "focus",
      "setTitle",
      "openApp",
      "notify",
      "registerShortcut",
    ] as const) {
      expect(mocks[name], name).not.toHaveBeenCalled();
    }
  });
});
