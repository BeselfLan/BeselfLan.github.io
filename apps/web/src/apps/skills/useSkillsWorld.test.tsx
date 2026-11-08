import { act, render } from "@testing-library/react";
import {
  StrictMode,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppApi } from "@/os/apps/types";
import type { StageLoop } from "./stageLoop";
import { useSkillsWorld, type SkillsWorld } from "./useSkillsWorld";

// The hook with a fake api and a fake clock. A small harness renders one div
// per id, wired with `world.ref(id)`, and copies what the hook returns out to
// a holder so a test can reach the loop.

type WorldApi = Pick<AppApi, "bounds" | "isVisible" | "subscribeVisible">;

function makeApi() {
  let onVisible: (visible: boolean) => void = () => {};
  const unsubscribe = vi.fn();
  const api: WorldApi = {
    isVisible: vi.fn(() => true),
    subscribeVisible: vi.fn((cb: (visible: boolean) => void) => {
      onVisible = cb;
      return unsubscribe;
    }),
    bounds: vi.fn(() => ({ width: 1000, height: 580 })),
  };
  return { api, unsubscribe, setVisible: (v: boolean) => onVisible(v) };
}

interface Holder {
  loop?: RefObject<StageLoop | null>;
  /** What `world.ref("a")` returned on each render. */
  refs: ((el: HTMLElement | null) => void)[];
  /** Called from an effect after each render, so the test can reach the hook. */
  report(
    loop: RefObject<StageLoop | null>,
    a: (el: HTMLElement | null) => void,
  ): void;
}
const holder = (): Holder => {
  const h: Holder = {
    refs: [],
    report(loop, a) {
      h.loop = loop;
      h.refs.push(a);
    },
  };
  return h;
};

function Harness({
  api,
  ids,
  radius = 28,
  hold,
  withStage = false,
}: {
  api: WorldApi;
  ids: readonly string[];
  radius?: number;
  hold: Holder;
  withStage?: boolean;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const world: SkillsWorld = useSkillsWorld({
    api,
    ids,
    radius,
    stageRef: withStage ? stage : undefined,
  });
  const a = world.ref("a");
  useEffect(() => {
    hold.report(world.loop, a);
  });
  return (
    <div data-stage="" ref={stage}>
      {ids.map((id) => (
        <div key={id} data-id={id} ref={world.ref(id)} />
      ))}
    </div>
  );
}

/**
 * The Harness inside a parent that reads the icons in its own layout effect.
 * A parent's layout effects run after its children's and before any passive
 * effect, and before the browser paints. So what `onLayout` gets is what the
 * first paint would show. The Harness's own effects are what write the
 * transforms, so they must be layout effects: as passive effects they would
 * run after this one, and `onLayout` would see icons with no transform, which
 * paint stacked at 0,0 for a frame. `render` wraps everything in `act`, which
 * flushes passive effects too, so a test that reads after `render` cannot tell.
 */
function Probe({
  api,
  ids,
  hold,
  onLayout,
}: {
  api: WorldApi;
  ids: readonly string[];
  hold: Holder;
  onLayout: (transforms: string[]) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const icons = box.current?.querySelectorAll<HTMLElement>("[data-id]") ?? [];
    onLayout([...icons].map((el) => el.style.transform));
  }, [ids, onLayout]);
  return (
    <div ref={box}>
      <Harness api={api} ids={ids} hold={hold} />
    </div>
  );
}

const IDS = ["a", "b", "c", "d", "e"];
const divs = (c: HTMLElement) => [
  ...c.querySelectorAll<HTMLElement>("[data-id]"),
];
const transforms = (c: HTMLElement) => divs(c).map((d) => d.style.transform);
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

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

describe("useSkillsWorld", () => {
  it("writes a transform to every element, before any frame", () => {
    const { api } = makeApi();
    const { container } = render(
      <Harness api={api} ids={IDS} hold={holder()} />,
    );
    expect(divs(container)).toHaveLength(5);
    for (const t of transforms(container)) {
      expect(t.startsWith("translate3d(")).toBe(true);
    }
    const first = transforms(container);
    advance(100);
    for (const t of transforms(container)) {
      expect(t.startsWith("translate3d(")).toBe(true);
    }
    // The icons drift: something moved.
    expect(transforms(container)).not.toEqual(first);
  });

  it("places every icon before the first paint, on mount and on a new list", () => {
    const { api } = makeApi();
    const hold = holder();
    const seen: string[][] = [];
    const onLayout = (transforms: string[]) => {
      seen.push(transforms);
    };
    const view = render(
      <Probe api={api} ids={IDS} hold={hold} onLayout={onLayout} />,
    );
    // On mount: the loop is created and the bodies are set in layout effects,
    // so the icons are already placed when a parent's layout effect runs.
    expect(seen).toHaveLength(1);
    expect(seen[0]).toHaveLength(5);
    for (const t of seen[0]) expect(t.startsWith("translate3d(")).toBe(true);

    // A new list, as on a tab switch: the new icons mount with no transform and
    // the bodies effect places them in the same commit.
    view.rerender(
      <Probe api={api} ids={["x", "y", "z"]} hold={hold} onLayout={onLayout} />,
    );
    expect(seen).toHaveLength(2);
    expect(seen[1]).toHaveLength(3);
    for (const t of seen[1]) expect(t.startsWith("translate3d(")).toBe(true);
  });

  it("sizes the world from api.bounds(), less the toolbar and footer", () => {
    const { api } = makeApi();
    const hold = holder();
    const ids = Array.from({ length: 45 }, (_, i) => `s${i}`);
    render(<Harness api={api} ids={ids} hold={hold} />);
    expect(api.bounds).toHaveBeenCalled();
    const check = () => {
      const bodies = hold.loop!.current!.bodies();
      expect(bodies).toHaveLength(45);
      for (const b of bodies) {
        // The stage is 1000 x 492, not the 1000 x 580 of the content area.
        expect(b.y + b.r).toBeLessThanOrEqual(492);
        expect(b.x + b.r).toBeLessThanOrEqual(1000);
      }
    };
    check();
    advance(1000);
    check();
  });

  describe("the seed", () => {
    it("is drawn in the effect, once per mount", () => {
      const spy = vi.spyOn(Math, "random");
      const { api } = makeApi();
      const hold = holder();

      renderToString(<Harness api={api} ids={IDS} hold={hold} />);
      expect(spy).toHaveBeenCalledTimes(0);

      const view = render(<Harness api={api} ids={IDS} hold={hold} />);
      expect(spy).toHaveBeenCalledTimes(1);
      view.rerender(<Harness api={api} ids={IDS} hold={hold} />);
      expect(spy).toHaveBeenCalledTimes(1);
      view.rerender(<Harness api={api} ids={["a", "b"]} hold={hold} />);
      expect(spy).toHaveBeenCalledTimes(1);

      view.unmount();
      render(<Harness api={api} ids={IDS} hold={hold} />);
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it("makes a different layout for a different draw", () => {
      const { api } = makeApi();
      const first = holder();
      const second = holder();
      vi.spyOn(Math, "random").mockReturnValue(0.25);
      render(<Harness api={api} ids={IDS} hold={first} />);
      const a = first.loop!.current!.bodies().map((b) => [b.x, b.y]);
      vi.spyOn(Math, "random").mockReturnValue(0.75);
      render(<Harness api={api} ids={IDS} hold={second} />);
      const b = second.loop!.current!.bodies().map((x) => [x.x, x.y]);
      expect(b).not.toEqual(a);
    });
  });

  it("follows the window's visibility", () => {
    const { api, setVisible } = makeApi();
    render(<Harness api={api} ids={IDS} hold={holder()} />);
    expect(vi.getTimerCount()).toBe(1);
    act(() => setVisible(false));
    expect(vi.getTimerCount()).toBe(0);
    act(() => setVisible(true));
    expect(vi.getTimerCount()).toBe(1);
  });

  it("starts stopped when the window starts hidden", () => {
    const { api, setVisible } = makeApi();
    vi.mocked(api.isVisible).mockReturnValue(false);
    const { container } = render(
      <Harness api={api} ids={IDS} hold={holder()} />,
    );
    expect(vi.getTimerCount()).toBe(0);
    // Still placed, so no icon sits at 0,0.
    for (const t of transforms(container)) {
      expect(t.startsWith("translate3d(")).toBe(true);
    }
    act(() => setVisible(true));
    expect(vi.getTimerCount()).toBe(1);
  });

  it("re-seeds for a new list of ids", () => {
    const { api } = makeApi();
    const hold = holder();
    const view = render(<Harness api={api} ids={IDS} hold={hold} />);
    const next = ["x", "y", "z"];
    view.rerender(<Harness api={api} ids={next} hold={hold} />);
    expect(hold.loop!.current!.bodies().map((b) => b.id)).toEqual(next);
    expect(divs(view.container)).toHaveLength(3);
    for (const t of transforms(view.container)) {
      expect(t.startsWith("translate3d(")).toBe(true);
    }
  });

  it("keeps the bodies when the ids are the same list in a new array", () => {
    const { api } = makeApi();
    const hold = holder();
    const view = render(<Harness api={api} ids={IDS} hold={hold} />);
    advance(200);
    const before = hold.loop!.current!.bodies().map((b) => [b.id, b.x, b.y]);
    view.rerender(<Harness api={api} ids={[...IDS]} hold={hold} />);
    expect(hold.loop!.current!.bodies().map((b) => [b.id, b.x, b.y])).toEqual(
      before,
    );
  });

  it("uses the radius it is given", () => {
    const { api } = makeApi();
    const hold = holder();
    const view = render(
      <Harness api={api} ids={IDS} radius={24} hold={hold} />,
    );
    for (const b of hold.loop!.current!.bodies()) expect(b.r).toBe(24);
    view.rerender(<Harness api={api} ids={IDS} radius={28} hold={hold} />);
    for (const b of hold.loop!.current!.bodies()) expect(b.r).toBe(28);
  });

  it("gives an element that mounts late its place at once", () => {
    const { api, setVisible } = makeApi();
    const hold = holder();
    const view = render(<Harness api={api} ids={IDS} hold={hold} />);
    // Stopped, so no frame writes: only the callback ref can place the icon.
    act(() => setVisible(false));
    const body = hold.loop!.current!.bodies()[0];
    const stray = document.createElement("div");
    hold.refs[0](stray);
    expect(stray.style.transform).toBe(
      `translate3d(${(body.x - body.r).toFixed(2)}px, ${(body.y - body.r).toFixed(2)}px, 0)`,
    );
    view.unmount();
  });

  it("returns the same ref function for an id on every render", () => {
    const { api } = makeApi();
    const hold = holder();
    const view = render(<Harness api={api} ids={IDS} hold={hold} />);
    view.rerender(<Harness api={api} ids={IDS} hold={hold} />);
    view.rerender(<Harness api={api} ids={["a", "q"]} hold={hold} />);
    expect(hold.refs.length).toBeGreaterThanOrEqual(3);
    expect(new Set(hold.refs).size).toBe(1);
  });

  it("survives Strict Mode, which mounts, unmounts and mounts again", () => {
    const { api, unsubscribe } = makeApi();
    const hold = holder();
    const { container, unmount } = render(
      <StrictMode>
        <Harness api={api} ids={IDS} hold={hold} />
      </StrictMode>,
    );
    // The first loop is disposed, and only the second one asks for a frame.
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    expect(hold.loop!.current!.bodies().map((b) => b.id)).toEqual(IDS);
    for (const t of transforms(container)) {
      expect(t.startsWith("translate3d(")).toBe(true);
    }
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(unsubscribe).toHaveBeenCalledTimes(2);
  });

  it("stops on unmount", () => {
    const { api, unsubscribe } = makeApi();
    const hold = holder();
    const view = render(<Harness api={api} ids={IDS} hold={hold} />);
    advance(50);
    const gone = divs(view.container);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(hold.loop!.current).toBeNull();
    const written = gone.map((d) => d.style.transform);
    advance(100);
    expect(gone.map((d) => d.style.transform)).toEqual(written);
  });

  describe("the stage's size", () => {
    class FakeObserver {
      static all: FakeObserver[] = [];
      observe = vi.fn();
      disconnect = vi.fn();
      constructor(public callback: () => void) {
        FakeObserver.all.push(this);
      }
    }
    const size = (el: Element, width: number, height: number) => {
      Object.defineProperty(el, "offsetWidth", {
        value: width,
        configurable: true,
      });
      Object.defineProperty(el, "offsetHeight", {
        value: height,
        configurable: true,
      });
    };

    beforeEach(() => {
      FakeObserver.all = [];
      vi.stubGlobal("ResizeObserver", FakeObserver);
    });

    it("moves the walls to the element's size", () => {
      const { api } = makeApi();
      const hold = holder();
      const view = render(
        <Harness api={api} ids={IDS} hold={hold} withStage />,
      );
      const [observer] = FakeObserver.all;
      expect(observer.observe).toHaveBeenCalledWith(
        view.container.querySelector("[data-stage]"),
      );
      const spy = vi.spyOn(hold.loop!.current!, "setBounds");

      size(view.container.querySelector("[data-stage]")!, 600, 300);
      act(() => observer.callback());
      expect(spy).toHaveBeenCalledWith({ x: 0, y: 0, width: 600, height: 300 });
      for (let i = 0; i < 60; i++) advance(16);
      for (const b of hold.loop!.current!.bodies()) {
        expect(b.x + b.r).toBeLessThanOrEqual(600.5);
        expect(b.y + b.r).toBeLessThanOrEqual(300.5);
      }
    });

    it("skips a size that is zero or not a number", () => {
      const { api } = makeApi();
      const hold = holder();
      const view = render(
        <Harness api={api} ids={IDS} hold={hold} withStage />,
      );
      const spy = vi.spyOn(hold.loop!.current!, "setBounds");
      const stage = view.container.querySelector("[data-stage]")!;
      for (const [w, h] of [
        [0, 300],
        [600, 0],
        [Number.NaN, 300],
        [600, Number.NaN],
      ]) {
        size(stage, w, h);
        act(() => FakeObserver.all[0].callback());
      }
      expect(spy).not.toHaveBeenCalled();
    });

    it("disconnects on unmount, and never watches without a stage", () => {
      const { api } = makeApi();
      const view = render(
        <Harness api={api} ids={IDS} hold={holder()} withStage />,
      );
      view.unmount();
      expect(FakeObserver.all[0].disconnect).toHaveBeenCalledTimes(1);

      FakeObserver.all = [];
      render(<Harness api={api} ids={IDS} hold={holder()} />);
      expect(FakeObserver.all).toHaveLength(0);
    });

    it("does nothing where there is no ResizeObserver", () => {
      vi.unstubAllGlobals();
      expect(typeof ResizeObserver).toBe("undefined");
      const { api } = makeApi();
      const { container } = render(
        <Harness api={api} ids={IDS} hold={holder()} withStage />,
      );
      expect(divs(container)).toHaveLength(5);
    });
  });
});
