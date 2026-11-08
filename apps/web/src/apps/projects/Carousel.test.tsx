import { act, fireEvent, render, screen } from "@testing-library/react";
import { MotionConfig } from "motion/react";
import { Profiler, StrictMode, type ReactElement } from "react";
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

const ITEMS = staticContent.featuredEntries();
const THETA = ringTheta(13);

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
});
afterEach(() => {
  vi.useRealTimers();
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
  });

  it("cancels its frame when it unmounts mid-spring", () => {
    const { unmount } = render(ui());
    press("Next item");
    frames(100);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
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
