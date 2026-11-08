import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MotionConfig } from "motion/react";
import {
  Profiler,
  StrictMode,
  useLayoutEffect,
  useRef,
  type ReactElement,
  type ReactNode,
} from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { staticContent } from "@/content/static";
import { Carousel, type CarouselProps } from "./Carousel";
import { ringTheta, ringTransform } from "./carousel.math";

// The ring in jsdom with a fake clock. Vitest does not apply CSS, so every
// lookup is by data attribute or role, never by class. Each step of the clock
// is its own act(): inside one act() React batches every store update into a
// single commit, and a build that sets state per frame would pass the Profiler
// case below. The fake requestAnimationFrame fires on 16 ms boundaries, so one
// step runs one frame.
//
// jsdom has no pointer capture, so the three methods are stubbed on
// HTMLElement.prototype for each test. A pointer event carries what a real
// primary press does (`ev`), because a jsdom PointerEvent defaults `isPrimary`
// to false.

const ITEMS = staticContent.featuredEntries();
const THETA = ringTheta(13);

const CAPTURE = [
  "setPointerCapture",
  "releasePointerCapture",
  "hasPointerCapture",
] as const;

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "performance",
    ],
  });
  for (const name of CAPTURE) {
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      writable: true,
      value: name === "hasPointerCapture" ? vi.fn(() => true) : vi.fn(),
    });
  }
});
afterEach(() => {
  // Unmount first: a press left down is let go of on unmount, which calls the
  // capture methods, and this hook runs before Testing Library's own cleanup.
  cleanup();
  vi.useRealTimers();
  for (const name of CAPTURE) {
    Reflect.deleteProperty(HTMLElement.prototype, name);
  }
  vi.restoreAllMocks();
});

/** `ms` of frames, one act() per 16 ms. */
const frames = (ms: number) => {
  for (let t = 0; t < ms; t += 16) {
    act(() => {
      vi.advanceTimersByTime(16);
    });
  }
};

const ui = (
  props: Partial<CarouselProps> = {},
  onSelect: CarouselProps["onSelect"] = vi.fn(),
): ReactElement => (
  <Carousel
    items={ITEMS}
    selectedId={null}
    onSelect={onSelect}
    paused={false}
    {...props}
  />
);
const reduced = (el: ReactElement) => (
  <MotionConfig reducedMotion="always">{el}</MotionConfig>
);

/** The first text node of the indicator: "k / n". */
const index = (c: HTMLElement) =>
  c.querySelector("[data-carousel-index]")!.firstChild!.textContent;
const item = (c: HTMLElement, id: string) =>
  c.querySelector<HTMLElement>(`[data-entry-id="${id}"]`)!;
const ringEl = (c: HTMLElement) =>
  c.querySelector<HTMLElement>("[data-carousel-ring]")!;
const stageEl = (c: HTMLElement) =>
  c.querySelector<HTMLElement>("[data-carousel]")!;
const frontIds = (c: HTMLElement) =>
  [...c.querySelectorAll("[data-front]")].map((e) =>
    e.getAttribute("data-entry-id"),
  );
const poses = (c: HTMLElement) => [
  ringEl(c).style.transform,
  ...[...c.querySelectorAll<HTMLElement>("[data-entry-id]")].map(
    (e) => `${e.style.transform}|${e.style.opacity}|${e.style.zIndex}`,
  ),
];
const press = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
/** A wheel over the stage. Returns false when the event was prevented. */
const wheel = (c: HTMLElement, deltaY: number, init: WheelEventInit = {}) =>
  fireEvent.wheel(stageEl(c), { deltaY, ...init });

/** The init of a primary-button pointer event at (500, 300). */
const ev = (over: PointerEventInit = {}): PointerEventInit => ({
  pointerId: 1,
  button: 0,
  isPrimary: true,
  clientX: 500,
  clientY: 300,
  ...over,
});
/** A pointer sequence on `el`: events bubble up to the stage. */
const down = (el: Element, over?: PointerEventInit) =>
  fireEvent.pointerDown(el, ev(over));
const moveTo = (el: Element, clientX: number, over?: PointerEventInit) =>
  fireEvent.pointerMove(el, ev({ clientX, ...over }));
const up = (el: Element, over?: PointerEventInit) =>
  fireEvent.pointerUp(el, ev(over));
/**
 * Makes the stage look scaled: `rectWidth` px on screen for `layoutWidth`
 * units of layout. jsdom measures nothing, so both reads are stubbed.
 */
const scaleStage = (c: HTMLElement, rectWidth: number, layoutWidth: number) => {
  const stage = stageEl(c);
  vi.spyOn(stage, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, rectWidth, 300),
  );
  Object.defineProperty(stage, "offsetWidth", {
    configurable: true,
    value: layoutWidth,
  });
};
/** The number in the ring's `rotateY(<n>deg)`. */
const rotation = (c: HTMLElement) =>
  Number(/rotateY\((-?[\d.]+)deg\)/.exec(ringEl(c).style.transform)![1]);
/** True when `rot` sits on a whole item. */
const whole = (rot: number) =>
  Math.abs(rot / THETA - Math.round(rot / THETA)) < 0.001;
const setCapture = () => vi.mocked(HTMLElement.prototype.setPointerCapture);
const releaseCapture = () =>
  vi.mocked(HTMLElement.prototype.releasePointerCapture);

/**
 * A parent whose own layout effect reads the ring's pose. It runs after its
 * children's layout effects and before any passive effect, so it sees a pose
 * only when `attach` ran in a layout effect.
 */
function Probe({
  onLayout,
  children,
}: {
  onLayout(transform: string): void;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const ring = box.current?.querySelector<HTMLElement>(
      "[data-carousel-ring]",
    );
    onLayout(ring?.style.transform ?? "no ring");
  }, [onLayout]);
  return <div ref={box}>{children}</div>;
}

describe("Carousel", () => {
  it("poses on mount", () => {
    const { container } = render(ui());
    const bash = item(container, "bash-shell");
    expect(frontIds(container)).toEqual(["bash-shell"]);
    expect(bash.style.opacity).toBe("1");
    expect(Number(item(container, "deadknight").style.opacity)).toBeLessThan(
      0.4,
    );
    const all = container.querySelectorAll<HTMLElement>("[data-entry-id]");
    expect(all).toHaveLength(13);
    for (const el of all) {
      expect(el.style.transform.startsWith("rotateY(")).toBe(true);
    }
    expect(ringEl(container).style.transform).toBe(
      "translateZ(-376.072px) rotateY(0deg)",
    );
  });

  it("paints the first pose before the first paint", () => {
    const onLayout = vi.fn();
    render(<Probe onLayout={onLayout}>{ui()}</Probe>);
    expect(onLayout).toHaveBeenCalledTimes(1);
    expect(onLayout).toHaveBeenCalledWith(
      "translateZ(-376.072px) rotateY(0deg)",
    );
  });

  it("sets the group, the controls and the stage apart", () => {
    const { container } = render(ui());
    const group = screen.getByRole("group", { name: "Projects" });
    expect(group.getAttribute("aria-roledescription")).toBe("carousel");
    // The controls are in the group and outside the stage that a drag will
    // start on (#95).
    for (const name of ["Previous item", "Next item"]) {
      const button = screen.getByRole("button", { name });
      expect(group.contains(button)).toBe(true);
      expect(stageEl(container).contains(button)).toBe(false);
    }
    expect(group.contains(stageEl(container))).toBe(true);
    // The items sit in the ring, which sits in the stage.
    expect(ringEl(container).parentElement).toBe(stageEl(container));
    expect(item(container, "bash-shell").parentElement).toBe(ringEl(container));
  });

  it("opens on the initial front, without animating", () => {
    const { container } = render(ui({ initialFrontId: "tetris-asm" }));
    expect(frontIds(container)).toEqual(["tetris-asm"]);
    expect(index(container)).toBe("2 / 13");
    expect(ringEl(container).style.transform).toBe(ringTransform(-THETA, 13));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("falls back to the first item for an initial front it does not have", () => {
    const { container } = render(ui({ initialFrontId: "nope" }));
    expect(frontIds(container)).toEqual(["bash-shell"]);
    expect(index(container)).toBe("1 / 13");
  });

  it("names the front item in text that is only read aloud", () => {
    const { container } = render(ui());
    const p = container.querySelector("[data-carousel-index]")!;
    expect(p.getAttribute("aria-live")).toBe("polite");
    expect(p.getAttribute("aria-atomic")).toBe("true");
    expect(p.textContent).toBe(`1 / 13, ${ITEMS[0].title}`);
    press("Next item");
    frames(1000);
    expect(p.textContent).toBe(`2 / 13, ${ITEMS[1].title}`);
  });

  it("puts only the front item in the tab order", () => {
    const { container } = render(ui());
    const tabs = () =>
      Object.fromEntries(
        [...container.querySelectorAll<HTMLElement>("[data-entry-id]")]
          .filter((e) => e.tabIndex === 0)
          .map((e) => [e.getAttribute("data-entry-id"), e.tabIndex]),
      );
    expect(tabs()).toEqual({ "bash-shell": 0 });
    for (const el of container.querySelectorAll<HTMLElement>(
      "[data-entry-id]:not([data-front])",
    )) {
      expect(el.tabIndex).toBe(-1);
    }
    press("Next item");
    frames(1000);
    expect(tabs()).toEqual({ "tetris-asm": 0 });
  });

  it("turns with the buttons", () => {
    const { container } = render(ui());
    press("Next item");
    frames(1000);
    expect(index(container)).toBe("2 / 13");
    expect(frontIds(container)).toEqual(["tetris-asm"]);
    expect(ringEl(container).style.transform).toBe(ringTransform(-THETA, 13));
    expect(vi.getTimerCount()).toBe(0);

    press("Previous item");
    frames(1000);
    expect(index(container)).toBe("1 / 13");
    expect(frontIds(container)).toEqual(["bash-shell"]);
    expect(ringEl(container).style.transform).toBe(ringTransform(0, 13));
  });

  it("goes round the ring in both directions", () => {
    const { container } = render(ui());
    press("Previous item");
    frames(1000);
    expect(index(container)).toBe("13 / 13");
    expect(frontIds(container)).toEqual(["thornhill-cs-club"]);
    press("Next item");
    frames(1000);
    expect(index(container)).toBe("1 / 13");
  });

  it("starts a second press from where the first is going", () => {
    const { container } = render(ui());
    press("Next item");
    press("Next item");
    frames(1000);
    expect(index(container)).toBe("3 / 13");
    expect(frontIds(container)).toEqual(["trivia-knockouts"]);
  });

  it("brings a clicked item to the front and selects it", () => {
    const onSelect = vi.fn();
    const { container } = render(ui({}, onSelect));
    fireEvent.click(item(container, "todo-fullstack"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("todo-fullstack");
    frames(1000);
    expect(frontIds(container)).toEqual(["todo-fullstack"]);
    expect(index(container)).toBe("4 / 13");
  });

  it("selects the front item without moving", () => {
    const onSelect = vi.fn();
    const { container } = render(ui({}, onSelect));
    const before = poses(container);
    fireEvent.click(item(container, "bash-shell"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("bash-shell");
    expect(vi.getTimerCount()).toBe(0);
    expect(poses(container)).toEqual(before);
  });

  it("goes the short way round to an item behind the front", () => {
    const { container } = render(ui());
    fireEvent.click(item(container, "emberhacks")); // index 10, 3 back
    frames(1000);
    expect(index(container)).toBe("11 / 13");
    // Three items back is -3 x θ turned the other way, not +10 x θ.
    expect(ringEl(container).style.transform).toBe(
      ringTransform(3 * THETA, 13),
    );
  });

  it("turns a click from where a running spring is going", () => {
    const { container } = render(ui());
    for (let i = 0; i < 6; i++) press("Next item");
    // From the target, -6 x θ, the item 12 is 6 x θ further on. From the
    // ring's place, still 0, it would be a single θ the other way.
    fireEvent.click(item(container, "thornhill-cs-club"));
    frames(2000);
    expect(index(container)).toBe("13 / 13");
    expect(ringEl(container).style.transform).toBe(
      ringTransform(-12 * THETA, 13),
    );
  });

  describe("under reduced motion", () => {
    it("jumps for a button", () => {
      const { container } = render(reduced(ui()));
      press("Next item");
      expect(frontIds(container)).toEqual(["tetris-asm"]);
      expect(index(container)).toBe("2 / 13");
      expect(ringEl(container).style.transform).toBe(ringTransform(-THETA, 13));
      expect(vi.getTimerCount()).toBe(0);
    });

    it("jumps for a click", () => {
      const onSelect = vi.fn();
      const { container } = render(reduced(ui({}, onSelect)));
      fireEvent.click(item(container, "todo-fullstack"));
      expect(onSelect).toHaveBeenCalledWith("todo-fullstack");
      expect(frontIds(container)).toEqual(["todo-fullstack"]);
      expect(index(container)).toBe("4 / 13");
      expect(vi.getTimerCount()).toBe(0);
    });

    it("lands a released drag at once, with no inertia", () => {
      const { container } = render(reduced(ui()));
      const bash = item(container, "bash-shell");
      down(bash);
      moveTo(bash, 400);
      // The drag itself still follows the pointer: that is direct handling.
      frames(16);
      expect(ringEl(container).style.transform).toBe(ringTransform(-30, 13));
      frames(16);
      up(bash, { clientX: 400 });
      expect(ringEl(container).style.transform).toBe(ringTransform(-THETA, 13));
      expect(index(container)).toBe("2 / 13");
      expect(vi.getTimerCount()).toBe(0);
    });

    it("lands a wheel at once when it goes quiet", () => {
      const { container } = render(reduced(ui()));
      wheel(container, 100);
      frames(128);
      // The wheel itself still moves the ring, then the idle snap jumps.
      expect(ringEl(container).style.transform).toBe(ringTransform(-THETA, 13));
      expect(index(container)).toBe("2 / 13");
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe("the keys", () => {
    /** Fires `key` on the focused item, as the browser does. */
    const key = (name: string, init: KeyboardEventInit = {}) =>
      fireEvent.keyDown(document.activeElement!, { key: name, ...init });

    it("step the ring and move focus to the front item", () => {
      const focus = vi.spyOn(HTMLElement.prototype, "focus");
      const { container } = render(ui());
      item(container, "bash-shell").focus();

      // Prevented, so the page does not scroll.
      expect(key("ArrowRight")).toBe(false);
      frames(1000);
      expect(frontIds(container)).toEqual(["tetris-asm"]);
      expect(index(container)).toBe("2 / 13");
      expect(document.activeElement).toBe(item(container, "tetris-asm"));
      // A plain focus() can scroll the window's clipped content box.
      expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
      expect(focus.mock.contexts.at(-1)).toBe(item(container, "tetris-asm"));

      expect(key("ArrowLeft")).toBe(false);
      frames(1000);
      expect(key("ArrowLeft")).toBe(false);
      frames(1000);
      expect(index(container)).toBe("13 / 13");
      expect(document.activeElement).toBe(item(container, "thornhill-cs-club"));

      expect(key("Home")).toBe(false);
      frames(1000);
      expect(index(container)).toBe("1 / 13");
      expect(document.activeElement).toBe(item(container, "bash-shell"));

      expect(key("End")).toBe(false);
      frames(1000);
      expect(index(container)).toBe("13 / 13");
      expect(document.activeElement).toBe(item(container, "thornhill-cs-club"));
      expect(vi.getTimerCount()).toBe(0);
    });

    it("start a second press from where the first is going", () => {
      const { container } = render(ui());
      item(container, "bash-shell").focus();
      key("ArrowRight");
      key("ArrowRight");
      frames(1000);
      expect(index(container)).toBe("3 / 13");
      expect(document.activeElement).toBe(item(container, "trivia-knockouts"));
    });

    it("go to the last item the short way from where a spring is heading", () => {
      const { container } = render(ui());
      item(container, "bash-shell").focus();
      for (let i = 0; i < 7; i++) key("ArrowRight");
      key("End");
      frames(3000);
      expect(index(container)).toBe("13 / 13");
      // From the target, -7 x θ, the last item is 5 x θ on. From the ring's
      // place, still 0, it would be one θ back.
      expect(ringEl(container).style.transform).toBe(
        ringTransform(-12 * THETA, 13),
      );
    });

    it("leave other keys alone", () => {
      const { container } = render(ui());
      item(container, "bash-shell").focus();
      for (const name of ["ArrowUp", "ArrowDown", "PageDown", "a"]) {
        expect(key(name)).toBe(true);
      }
      frames(1000);
      expect(index(container)).toBe("1 / 13");
    });

    it("are heard on the stage only", () => {
      const { container } = render(ui());
      expect(fireEvent.keyDown(window, { key: "ArrowRight" })).toBe(true);
      expect(fireEvent.keyDown(document.body, { key: "End" })).toBe(true);
      frames(1000);
      expect(index(container)).toBe("1 / 13");
    });

    it("leave chords alone", () => {
      const { container } = render(ui());
      item(container, "bash-shell").focus();
      // Alt+Arrow is the browser's back and forward.
      for (const chord of [
        { altKey: true },
        { ctrlKey: true },
        { metaKey: true },
      ]) {
        expect(key("ArrowRight", chord)).toBe(true);
      }
      expect(key("ArrowRight", { isComposing: true })).toBe(true);
      frames(1000);
      expect(index(container)).toBe("1 / 13");
      expect(document.activeElement).toBe(item(container, "bash-shell"));
    });

    it("do nothing on a ring of one item", () => {
      const one = ITEMS.filter((e) => e.id === "thornhill-cs-club");
      const { container } = render(ui({ items: one }));
      item(container, "thornhill-cs-club").focus();
      expect(key("ArrowRight")).toBe(true);
      expect(key("End")).toBe(true);
      frames(1000);
      expect(index(container)).toBe("1 / 1");
      expect(ringEl(container).style.transform).toBe(ringTransform(0, 1));
    });

    it("jump while the window is hidden", () => {
      const { container } = render(ui({ paused: true }));
      item(container, "bash-shell").focus();
      expect(key("ArrowRight")).toBe(false);
      expect(index(container)).toBe("2 / 13");
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe("the drag", () => {
    it("divides every pointer delta by the scale", () => {
      const { container } = render(ui());
      scaleStage(container, 750, 1500); // The screen is at half size.
      const bash = item(container, "bash-shell");
      down(bash);
      moveTo(bash, 400);
      frames(16);
      // 100 px is 200 units, 0.3 degrees each, and the item follows the
      // pointer to the left. No division would give -30, and C.1's sign +60.
      expect(ringEl(container).style.transform).toBe(ringTransform(-60, 13));
      frames(100);
      up(bash, { clientX: 400 });
      frames(1000);
      expect(ringEl(container).style.transform).toBe(
        ringTransform(-2 * THETA, 13),
      );
      expect(index(container)).toBe("3 / 13");
    });

    it("turns 0.3 degrees per unit at scale 1", () => {
      const { container } = render(ui());
      scaleStage(container, 1500, 1500);
      const bash = item(container, "bash-shell");
      down(bash);
      moveTo(bash, 400);
      frames(16);
      expect(ringEl(container).style.transform).toBe(ringTransform(-30, 13));
      frames(100);
      up(bash, { clientX: 400 });
      frames(1000);
      expect(ringEl(container).style.transform).toBe(ringTransform(-THETA, 13));
    });

    it("measures from the press point, not move by move", () => {
      const { container } = render(ui());
      const bash = item(container, "bash-shell");
      down(bash);
      moveTo(bash, 450);
      moveTo(bash, 400);
      frames(16);
      // Summing each move's distance from the press would give -45.
      expect(ringEl(container).style.transform).toBe(ringTransform(-30, 13));
    });

    it("follows the pointer back past the press point", () => {
      const { container } = render(ui());
      const bash = item(container, "bash-shell");
      down(bash);
      moveTo(bash, 400);
      moveTo(bash, 600);
      frames(16);
      expect(ringEl(container).style.transform).toBe(ringTransform(30, 13));
    });

    it("leaves the ring alone for a press that is not a primary press", () => {
      for (const over of [{ button: 2 }, { isPrimary: false }]) {
        const { container, unmount } = render(ui());
        const bash = item(container, "bash-shell");
        down(bash, over);
        moveTo(bash, 400);
        frames(16);
        expect(ringEl(container).style.transform).toBe(ringTransform(0, 13));
        expect(setCapture()).not.toHaveBeenCalled();
        unmount();
      }
    });

    it("ignores the moves of another pointer", () => {
      const { container } = render(ui());
      const bash = item(container, "bash-shell");
      down(bash);
      moveTo(bash, 400, { pointerId: 2 });
      frames(16);
      expect(ringEl(container).style.transform).toBe(ringTransform(0, 13));
    });

    it("waits for the threshold before it takes capture", () => {
      const { container } = render(ui());
      const bash = item(container, "bash-shell");
      down(bash);
      expect(setCapture()).not.toHaveBeenCalled();
      moveTo(bash, 497); // 3 units
      expect(setCapture()).not.toHaveBeenCalled();
      frames(16);
      expect(ringEl(container).style.transform).toBe(ringTransform(0, 13));
      moveTo(bash, 495); // 5 units
      expect(setCapture()).toHaveBeenCalledTimes(1);
      expect(setCapture()).toHaveBeenCalledWith(1);
      expect(setCapture().mock.contexts[0]).toBe(stageEl(container));
      moveTo(bash, 480);
      expect(setCapture()).toHaveBeenCalledTimes(1);
    });

    it("measures the threshold in screen units", () => {
      const { container } = render(ui());
      scaleStage(container, 750, 1500);
      const bash = item(container, "bash-shell");
      down(bash);
      // 3 px is 6 units at half size.
      moveTo(bash, 497);
      expect(setCapture()).toHaveBeenCalledTimes(1);
    });

    it("coasts on after a flick and lands on an item", () => {
      const { container } = render(ui());
      const bash = item(container, "bash-shell");
      down(bash);
      moveTo(bash, 400);
      frames(16);
      up(bash, { clientX: 400 });
      frames(2000);
      // At rest the same drag ends at -θ. A flick at 1080 degrees per second
      // carries on for several items.
      expect(rotation(container)).toBeLessThanOrEqual(-5 * THETA);
      expect(whole(rotation(container))).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("coasts the other way for a flick to the right", () => {
      const { container } = render(ui());
      const bash = item(container, "bash-shell");
      down(bash);
      moveTo(bash, 600);
      frames(16);
      up(bash, { clientX: 600 });
      frames(2000);
      expect(rotation(container)).toBeGreaterThanOrEqual(5 * THETA);
      expect(whole(rotation(container))).toBe(true);
    });

    it("stops a turning ring when it is pressed", () => {
      const { container } = render(ui());
      press("Next item");
      frames(48);
      const stage = stageEl(container);
      down(stage);
      const frozen = ringEl(container).style.transform;
      expect(rotation(container)).toBeLessThan(-0.5);
      expect(rotation(container)).toBeGreaterThan(-THETA / 2);
      frames(200);
      expect(ringEl(container).style.transform).toBe(frozen);
      expect(vi.getTimerCount()).toBe(0);
      // Let go without a move: the nearest item is the first one, and the
      // ring springs back to it. Without the freeze it reaches -θ.
      up(stage);
      frames(1000);
      expect(ringEl(container).style.transform).toBe(ringTransform(0, 13));
      expect(index(container)).toBe("1 / 13");
    });

    it("lets go at rest when the press is cancelled", () => {
      const onSelect = vi.fn();
      const { container } = render(ui({}, onSelect));
      const bash = item(container, "bash-shell");
      down(bash);
      moveTo(bash, 400);
      fireEvent.pointerCancel(bash, ev());
      frames(1000);
      expect(ringEl(container).style.transform).toBe(ringTransform(-THETA, 13));
      moveTo(bash, 300);
      frames(16);
      expect(ringEl(container).style.transform).toBe(ringTransform(-THETA, 13));
      // A cancelled press swallows no click.
      fireEvent.click(item(container, "tetris-asm"));
      expect(onSelect).toHaveBeenCalledWith("tetris-asm");
    });

    it("lets go only when the stage itself loses capture", () => {
      const { container } = render(ui());
      const bash = item(container, "bash-shell");
      down(bash);
      moveTo(bash, 400);
      // On touch the item held implicit capture, and its event bubbles up when
      // the stage takes over.
      fireEvent.lostPointerCapture(bash, ev());
      moveTo(bash, 300);
      frames(16);
      expect(ringEl(container).style.transform).toBe(ringTransform(-60, 13));
      fireEvent.lostPointerCapture(stageEl(container), ev());
      frames(1000);
      expect(ringEl(container).style.transform).toBe(
        ringTransform(-2 * THETA, 13),
      );
    });

    it("lets go at rest when the pointer leaves before the threshold", () => {
      const { container } = render(ui());
      const bash = item(container, "bash-shell");
      down(bash);
      fireEvent.pointerLeave(stageEl(container), ev());
      moveTo(bash, 400);
      frames(16);
      expect(ringEl(container).style.transform).toBe(ringTransform(0, 13));
      expect(setCapture()).not.toHaveBeenCalled();
    });

    it("keeps dragging when the pointer leaves after the threshold", () => {
      const { container } = render(ui());
      const bash = item(container, "bash-shell");
      down(bash);
      moveTo(bash, 400);
      fireEvent.pointerLeave(stageEl(container), ev());
      moveTo(bash, 300);
      frames(16);
      expect(ringEl(container).style.transform).toBe(ringTransform(-60, 13));
    });

    it("prevents a native drag of the icon", () => {
      const { container } = render(ui());
      const img = item(container, "bash-shell").querySelector("img")!;
      expect(fireEvent.dragStart(img)).toBe(false);
    });

    it("never selects an item, and swallows only the click after a drag", () => {
      const onSelect = vi.fn();
      const { container } = render(ui({}, onSelect));
      const bash = item(container, "bash-shell");
      const drag = () => {
        down(bash);
        moveTo(bash, 400);
        up(bash, { clientX: 400 });
      };

      // The swallow runs in the capture phase, before the item's own listeners.
      const direct = vi.fn();
      bash.addEventListener("click", direct);
      drag();
      fireEvent.click(bash);
      expect(onSelect).not.toHaveBeenCalled();
      expect(direct).not.toHaveBeenCalled();
      // The flag went with that click.
      fireEvent.click(bash);
      expect(onSelect).toHaveBeenCalledTimes(1);

      // Enter on the front item clicks with no pointerdown before it, so a key
      // clears the flag.
      drag();
      fireEvent.keyDown(bash, { key: "Shift" });
      fireEvent.click(bash);
      expect(onSelect).toHaveBeenCalledTimes(2);

      // So does the next press.
      drag();
      down(bash);
      up(bash);
      fireEvent.click(bash);
      expect(onSelect).toHaveBeenCalledTimes(3);
    });

    it("counts a press that barely moves as a click", () => {
      const onSelect = vi.fn();
      const { container } = render(ui({}, onSelect));
      const todo = item(container, "todo-fullstack");
      down(todo);
      moveTo(todo, 498); // 2 units
      up(todo, { clientX: 498 });
      // An idle ring on an item schedules nothing.
      expect(vi.getTimerCount()).toBe(0);
      fireEvent.click(todo);
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith("todo-fullstack");
    });

    it("ignores a press while the window is hidden", () => {
      const { container } = render(ui({ paused: true }));
      const bash = item(container, "bash-shell");
      down(bash);
      moveTo(bash, 400);
      frames(16);
      expect(ringEl(container).style.transform).toBe(ringTransform(0, 13));
      expect(setCapture()).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe("the wheel", () => {
    it("turns the ring directly and snaps 120 ms after the last event", () => {
      const { container } = render(ui());
      for (let i = 0; i < 3; i++) {
        // Prevented, so the page does not scroll or swipe back.
        expect(wheel(container, 100)).toBe(false);
      }
      frames(16);
      // 3 x -15 degrees, moved directly and not yet snapping.
      expect(ringEl(container).style.transform).toBe(ringTransform(-45, 13));
      frames(112);
      frames(1000);
      expect(index(container)).toBe("3 / 13");
      expect(ringEl(container).style.transform).toBe(
        ringTransform(-2 * THETA, 13),
      );
      expect(vi.getTimerCount()).toBe(0);
    });

    it("turns on the larger of the two axes", () => {
      const { container } = render(ui());
      fireEvent.wheel(stageEl(container), { deltaX: 200, deltaY: 10 });
      frames(16);
      expect(ringEl(container).style.transform).toBe(ringTransform(-30, 13));
    });

    it("is prevented and ignored during a press", () => {
      const { container } = render(ui());
      down(item(container, "bash-shell"));
      expect(wheel(container, 100)).toBe(false);
      frames(16);
      expect(ringEl(container).style.transform).toBe(ringTransform(0, 13));
      frames(500);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("leaves ctrl+wheel to the page", () => {
      const { container } = render(ui());
      // Ctrl+wheel and the trackpad pinch zoom the page (WCAG 1.4.4).
      expect(wheel(container, 100, { ctrlKey: true })).toBe(true);
      frames(1000);
      expect(index(container)).toBe("1 / 13");
      expect(ringEl(container).style.transform).toBe(ringTransform(0, 13));
      expect(vi.getTimerCount()).toBe(0);
    });

    it("restarts its idle timer on every event", () => {
      const { container } = render(ui());
      for (let i = 0; i < 3; i++) wheel(container, 100);
      frames(100);
      wheel(container, 100);
      frames(100);
      // A timer that was not restarted would already be springing to -2 x θ.
      expect(ringEl(container).style.transform).toBe(ringTransform(-60, 13));
      frames(1000);
      expect(index(container)).toBe("3 / 13");
    });

    it("gives way to a button pressed during a run", () => {
      const { container } = render(ui());
      wheel(container, 100);
      press("Next item");
      frames(1000);
      // The button steps from the nearest item, -θ, to -2 x θ. An idle snap
      // left pending would retarget the spring at 120 ms and end at -θ.
      expect(index(container)).toBe("3 / 13");
      expect(ringEl(container).style.transform).toBe(
        ringTransform(-2 * THETA, 13),
      );
    });
  });

  it("sets no React state per frame", () => {
    let commits = 0;
    const { container } = render(
      <Profiler
        id="carousel"
        onRender={() => {
          commits += 1;
        }}
      >
        {ui()}
      </Profiler>,
    );
    commits = 0;
    fireEvent.click(item(container, "invoice-creator")); // index 4
    frames(1000);
    expect(index(container)).toBe("5 / 13");
    // One commit per item that passes the front. A setState per frame is
    // about 60.
    expect(commits).toBeGreaterThan(0);
    expect(commits).toBeLessThanOrEqual(6);
  });

  it("leaves the poses to the loop when it re-renders", () => {
    const { container, rerender } = render(ui());
    press("Next item");
    frames(1000);
    const before = poses(container);
    rerender(ui({ selectedId: "todo-fullstack" }));
    expect(
      item(container, "todo-fullstack").hasAttribute("data-selected"),
    ).toBe(true);
    expect(poses(container)).toEqual(before);
  });

  it("keeps the poses of a ring that is still turning on a re-render", () => {
    const { container, rerender } = render(ui());
    press("Next item");
    frames(100);
    const mid = poses(container);
    expect(mid[0]).not.toBe(ringTransform(0, 13));
    rerender(ui({ selectedId: "todo-fullstack" }));
    expect(poses(container)).toEqual(mid);
  });

  describe("while the window is hidden", () => {
    it("stops mid-spring and sits at the target", () => {
      const { container, rerender } = render(ui());
      press("Next item");
      frames(100);
      expect(vi.getTimerCount()).toBe(1);
      rerender(ui({ paused: true }));
      expect(vi.getTimerCount()).toBe(0);
      expect(ringEl(container).style.transform).toBe(ringTransform(-THETA, 13));
      expect(index(container)).toBe("2 / 13");

      rerender(ui({ paused: false }));
      expect(vi.getTimerCount()).toBe(0);
      expect(ringEl(container).style.transform).toBe(ringTransform(-THETA, 13));
    });

    it("jumps for every move, and schedules nothing", () => {
      const { container } = render(ui({ paused: true }));
      press("Next item");
      expect(index(container)).toBe("2 / 13");
      expect(vi.getTimerCount()).toBe(0);
      fireEvent.click(item(container, "todo-fullstack"));
      expect(index(container)).toBe("4 / 13");
      expect(vi.getTimerCount()).toBe(0);
    });

    it("moves with a frame again once the window is back", () => {
      const { container, rerender } = render(ui({ paused: true }));
      rerender(ui({ paused: false }));
      press("Next item");
      expect(vi.getTimerCount()).toBe(1);
      frames(1000);
      expect(index(container)).toBe("2 / 13");
    });

    it("ends a wheel run and sits on the nearest item", () => {
      const { container, rerender } = render(ui());
      wheel(container, 100);
      expect(vi.getTimerCount()).toBe(2); // The frame and the idle timer.
      rerender(ui({ paused: true }));
      expect(vi.getTimerCount()).toBe(0);
      expect(ringEl(container).style.transform).toBe(ringTransform(-THETA, 13));
      expect(index(container)).toBe("2 / 13");
    });

    it("ends a drag and lets go of the pointer", () => {
      const { container, rerender } = render(ui());
      const bash = item(container, "bash-shell");
      down(bash);
      moveTo(bash, 400);
      expect(vi.getTimerCount()).toBe(1); // The frame that will paint it.
      rerender(ui({ paused: true }));
      expect(vi.getTimerCount()).toBe(0);
      expect(ringEl(container).style.transform).toBe(ringTransform(-THETA, 13));
      expect(releaseCapture()).toHaveBeenCalledTimes(1);
      expect(releaseCapture()).toHaveBeenCalledWith(1);
      // The press is over: a later move and a frame change nothing.
      moveTo(bash, 300);
      frames(16);
      expect(ringEl(container).style.transform).toBe(ringTransform(-THETA, 13));
      expect(vi.getTimerCount()).toBe(0);
    });

    it("takes a ring that a press stopped to the nearest item", () => {
      const { container, rerender } = render(ui());
      press("Next item");
      frames(48);
      // The spring is heading for -θ, but the hand has stopped it near 0.
      down(stageEl(container));
      rerender(ui({ paused: true }));
      expect(ringEl(container).style.transform).toBe(ringTransform(0, 13));
      expect(vi.getTimerCount()).toBe(0);
    });

    it("prevents a wheel and does nothing with it", () => {
      const { container } = render(ui({ paused: true }));
      expect(wheel(container, 100)).toBe(false);
      frames(500);
      expect(ringEl(container).style.transform).toBe(ringTransform(0, 13));
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  it("cancels its frame when it unmounts mid-spring", () => {
    const { unmount } = render(ui());
    press("Next item");
    frames(100);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("lets go of a drag when it unmounts", () => {
    const { container, unmount } = render(ui());
    const bash = item(container, "bash-shell");
    down(bash);
    moveTo(bash, 400);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(releaseCapture()).toHaveBeenCalledWith(1);
  });

  it("clears the wheel timer and unbinds the stage when it unmounts", () => {
    const { container, unmount } = render(ui());
    const stage = stageEl(container);
    wheel(container, 100);
    expect(vi.getTimerCount()).toBe(2);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    // The listener is gone: the event is not prevented and starts no timer.
    expect(fireEvent.wheel(stage, { deltaY: 100 })).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("survives Strict Mode", () => {
    const { container } = render(<StrictMode>{ui()}</StrictMode>);
    expect(ringEl(container).style.transform).toBe(ringTransform(0, 13));
    expect(frontIds(container)).toEqual(["bash-shell"]);
    expect(vi.getTimerCount()).toBe(0);
    press("Next item");
    frames(1000);
    expect(index(container)).toBe("2 / 13");
    expect(ringEl(container).style.transform).toBe(ringTransform(-THETA, 13));
  });

  it("binds the wheel once under Strict Mode", () => {
    const { container } = render(<StrictMode>{ui()}</StrictMode>);
    wheel(container, 200); // -30 degrees
    frames(128);
    frames(1000);
    // A listener left over from the first attach would double it to -60 and
    // end on "3 / 13".
    expect(index(container)).toBe("2 / 13");
    expect(ringEl(container).style.transform).toBe(ringTransform(-THETA, 13));
  });

  it("says so when it has nothing", () => {
    const { container } = render(ui({ items: [] }));
    expect(screen.getByText("Nothing here yet.")).toBeTruthy();
    expect(container.querySelector("[data-carousel]")).toBeNull();
    expect(screen.queryByRole("button", { name: "Next item" })).toBeNull();
  });

  it("disables both buttons for a single item", () => {
    const one = ITEMS.filter((e) => e.id === "thornhill-cs-club");
    const { container } = render(ui({ items: one }));
    expect(index(container)).toBe("1 / 1");
    for (const name of ["Previous item", "Next item"]) {
      expect(
        screen.getByRole<HTMLButtonElement>("button", { name }).disabled,
      ).toBe(true);
    }
    expect(ringEl(container).style.transform).toBe(ringTransform(0, 1));
  });

  describe("the stage offset", () => {
    it("shifts the stage", () => {
      const { container } = render(ui({ offsetX: 190 }));
      expect(stageEl(container).style.transform).toContain("translateX(190px)");
      expect(stageEl(container).style.perspective).toBe("1200px");
    });

    it("does not shift without an offset", () => {
      const { container } = render(ui());
      expect(stageEl(container).style.transform).toContain("translateX(0px)");
    });

    it("moves at once under reduced motion", () => {
      const { container } = render(reduced(ui({ offsetX: 190 })));
      expect(stageEl(container).style.transition).toBe("none");
      expect(stageEl(container).style.transform).toContain("translateX(190px)");
    });

    it("leaves the transition to the stylesheet otherwise", () => {
      const { container } = render(ui({ offsetX: 190 }));
      expect(stageEl(container).style.transition).toBe("");
    });
  });

  it("marks only the selected item", () => {
    const { container } = render(ui({ selectedId: "tetris-asm" }));
    const marked = [...container.querySelectorAll("[data-selected]")].map((e) =>
      e.getAttribute("data-entry-id"),
    );
    expect(marked).toEqual(["tetris-asm"]);
  });
});
