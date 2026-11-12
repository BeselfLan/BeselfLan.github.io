import { act, render, renderHook } from "@testing-library/react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Screen,
  useOptionalScreen,
  useScreen,
  useScreenMode,
  type ScreenValue,
} from "@/os/screen/Screen";
import { os, useOS } from "@/os/store";
import { FakeResizeObserver, stubMedia } from "../helpers/browser";

const QUERY =
  "(max-width: 899.98px), (pointer: coarse) and (orientation: portrait)";

let seen: ScreenValue;
const record = (v: ScreenValue) => {
  seen = v;
};
function Probe() {
  record(useScreen());
  return null;
}

let media: ReturnType<typeof stubMedia>;
const mount = () =>
  render(
    <Screen>
      <Probe />
    </Screen>,
  );
const resize = (w: number, h: number) =>
  act(() => FakeResizeObserver.last.trigger(w, h));
const box = () => document.querySelector<HTMLElement>("[data-screen-box]")!;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  media = stubMedia(false);
  localStorage.clear();
  useOS.setState(useOS.getInitialState(), true);
  os.windows.setAppLookup(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("scaling", () => {
  it("starts at the virtual size", () => {
    mount();
    expect(seen.scale).toBe(1);
    expect(box().style.width).toBe("1440px");
    expect(box().style.height).toBe("900px");
  });

  it.each([
    [720, 900, 0.5],
    [1440, 450, 0.5],
    [2880, 1800, 2],
  ])("fits the limiting side: %ix%i", (w, h, scale) => {
    mount();
    resize(w, h);
    expect(seen.scale).toBe(scale);
  });

  it("observes the container, not the box", () => {
    mount();
    expect([...FakeResizeObserver.last.targets]).toEqual([box().parentElement]);
  });

  it("recomputes on resize", () => {
    mount();
    resize(720, 450);
    expect(seen.scale).toBe(0.5);
    resize(1080, 675);
    expect(seen.scale).toBe(0.75);
  });

  it.each([
    [1440, 450, 360, 0],
    [720, 900, 0, 225],
  ])("centres the scaled box: %ix%i", (w, h, left, top) => {
    mount();
    resize(w, h);
    expect(box().style.left).toBe(`${left}px`);
    expect(box().style.top).toBe(`${top}px`);
  });

  it("applies the scale to the box", () => {
    mount();
    resize(720, 450);
    expect(box().style.getPropertyValue("--s")).toBe("0.5");
    expect(box().className).toContain("[transform:scale(var(--s))]");
    expect(box().className).toContain("origin-top-left");
  });

  it("reads the content size, not the transformed box", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      width: 100,
      height: 100,
    } as DOMRect);
    mount();
    resize(720, 450);
    expect(seen.scale).toBe(0.5);
  });

  it.each([
    [0, 0],
    [720, 0],
    [0, 450],
  ])("ignores a zero size: %ix%i", (w, h) => {
    mount();
    resize(720, 450);
    resize(w, h);
    expect(seen.scale).toBe(0.5);
  });
});

describe("mode", () => {
  it("uses the D4 query", () => {
    mount();
    expect(media.matchMedia).toHaveBeenCalledWith(QUERY);
  });

  it("the mode follows the viewport, not the container", () => {
    mount();
    resize(390, 844);
    expect(seen.mode).toBe("laptop");
    act(() => media.set(true));
    expect(seen.mode).toBe("fullscreen");
  });

  it("fullscreen is one to one", () => {
    media = stubMedia(true);
    mount();
    resize(390, 844);
    expect(seen.scale).toBe(1);
    expect(box().style.width).toBe("390px");
    expect(box().style.height).toBe("844px");
    expect(box().style.left).toBe("0px");
    expect(box().style.top).toBe("0px");
  });

  it.each([false, true])("useScreenMode works above Screen: %s", (on) => {
    media = stubMedia(on);
    const { result } = renderHook(() => useScreenMode());
    expect(result.current).toBe(on ? "fullscreen" : "laptop");
  });

  it("cleans up", () => {
    const { unmount } = mount();
    const observer = FakeResizeObserver.last;
    expect(media.listeners.size).toBe(1);
    unmount();
    expect(observer.disconnect).toHaveBeenCalled();
    expect(media.listeners.size).toBe(0);
  });
});

describe("useScreen", () => {
  it("exposes the screen", () => {
    mount();
    expect(Object.keys(seen).sort()).toEqual([
      "mode",
      "portalTarget",
      "scale",
      "toScreenPoint",
      "workArea",
    ]);
  });

  it("throws outside Screen", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useScreen())).toThrow(/inside Screen/);
  });

  it("useOptionalScreen is null outside a Screen and the screen inside", () => {
    const outside = renderHook(() => useOptionalScreen());
    expect(outside.result.current).toBeNull();

    const inside = renderHook(
      () => ({ optional: useOptionalScreen(), strict: useScreen() }),
      { wrapper: Screen },
    );
    expect(inside.result.current.optional).not.toBeNull();
    expect(inside.result.current.optional?.portalTarget).not.toBeNull();
    expect(inside.result.current.optional?.portalTarget).toBe(
      inside.result.current.strict.portalTarget,
    );
  });

  it("toScreenPoint removes the offset and divides by the scale", () => {
    mount();
    resize(720, 450);
    vi.spyOn(box(), "getBoundingClientRect").mockReturnValue({
      left: 100,
      top: 50,
    } as DOMRect);
    expect(seen.toScreenPoint(300, 125)).toEqual({ x: 400, y: 150 });
  });

  it("toScreenPoint is one to one in fullscreen", () => {
    media = stubMedia(true);
    mount();
    resize(390, 844);
    vi.spyOn(box(), "getBoundingClientRect").mockReturnValue({
      left: 100,
      top: 50,
    } as DOMRect);
    expect(seen.toScreenPoint(300, 125)).toEqual({ x: 200, y: 75 });
  });
});

describe("work area", () => {
  it("the laptop work area is the slice's", () => {
    mount();
    expect(seen.workArea).toEqual(useOS.getInitialState().windows.workArea);
    const before = seen.workArea;
    resize(720, 450);
    expect(seen.workArea).toBe(before);
  });

  it.each([
    [390, 844, { x: 0, y: 32, w: 390, h: 748 }],
    [844, 390, { x: 0, y: 32, w: 844, h: 294 }],
    [300, 80, { x: 0, y: 32, w: 300, h: 0 }],
  ])(
    "the fullscreen work area leaves room for the bars: %ix%i",
    (w, h, area) => {
      media = stubMedia(true);
      mount();
      resize(w, h);
      expect(seen.workArea).toEqual(area);
    },
  );
});

describe("portal", () => {
  it("the portal target is inside the box", () => {
    function Portaled() {
      const { portalTarget } = useScreen();
      return portalTarget
        ? createPortal(<span data-testid="p" />, portalTarget)
        : null;
    }
    render(
      <Screen>
        <Probe />
        <Portaled />
      </Screen>,
    );
    expect(box().contains(seen.portalTarget)).toBe(true);
    expect(box().querySelector("[data-testid=p]")).not.toBeNull();
    expect(document.body.querySelector(":scope > [data-testid=p]")).toBeNull();
  });

  it("the portal is hidden only while it is empty", () => {
    function Toggled({ on }: { on: boolean }) {
      const { portalTarget } = useScreen();
      return on && portalTarget
        ? createPortal(<span data-testid="p" />, portalTarget)
        : null;
    }
    const tree = (on: boolean) => (
      <Screen>
        <Toggled on={on} />
      </Screen>
    );
    const { rerender } = render(tree(false));
    const portal = document.querySelector<HTMLElement>("[data-screen-portal]")!;

    // Empty: hidden by `empty:invisible`, with the box and the pointer
    // behaviour it always had. jsdom loads no Tailwind CSS, so this pins the
    // class contract; window.spec.ts pins the computed style.
    expect(portal.matches(":empty")).toBe(true);
    for (const kept of [
      "empty:invisible",
      "absolute",
      "inset-0",
      "pointer-events-none",
    ]) {
      expect(portal.classList.contains(kept)).toBe(true);
    }
    for (const wrong of ["invisible", "hidden", "empty:hidden"]) {
      expect(portal.classList.contains(wrong)).toBe(false);
    }

    // A child is portaled in: the layer is no longer empty, so the variant
    // stops applying, and the child is the one that was rendered.
    rerender(tree(true));
    expect(portal.matches(":empty")).toBe(false);
    expect(portal.querySelector("[data-testid=p]")).not.toBeNull();

    rerender(tree(false));
    expect(portal.matches(":empty")).toBe(true);
  });

  it("the portal comes after the content", () => {
    render(
      <Screen>
        <i data-testid="content" />
      </Screen>,
    );
    const content = document.querySelector("[data-testid=content]")!;
    const wrapper = content.parentElement!;
    const portal = document.querySelector("[data-screen-portal]")!;
    expect(wrapper.className).toContain("isolate");
    expect(portal.className).toContain("pointer-events-none");
    expect(
      wrapper.compareDocumentPosition(portal) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

// Output that depends on the mode, so a mode read during the first render
// shows up as a markup mismatch.
function ModeTag() {
  return <i data-mode={useScreen().mode} />;
}

describe("hydration", () => {
  it("the server render touches no browser API", () => {
    vi.stubGlobal("matchMedia", () => {
      throw new Error("no matchMedia on the server");
    });
    vi.stubGlobal("ResizeObserver", () => {
      throw new Error("no ResizeObserver on the server");
    });
    const html = renderToString(
      <Screen>
        <Probe />
        <ModeTag />
      </Screen>,
    );
    expect(html).toContain("--s:1");
    expect(html).toContain('data-mode="laptop"');
    expect(seen.mode).toBe("laptop");
    expect(seen.portalTarget).toBeNull();
  });

  it("hydrates with no warnings, then switches", () => {
    const tree = (
      <Screen>
        <Probe />
        <ModeTag />
      </Screen>
    );
    const html = renderToString(tree);
    media = stubMedia(true);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onRecoverableError = vi.fn();
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    let root!: ReturnType<typeof hydrateRoot>;
    act(() => {
      root = hydrateRoot(container, tree, { onRecoverableError });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(seen.mode).toBe("fullscreen");
    act(() => root.unmount());
    container.remove();
  });
});

describe("store", () => {
  const state = () => useOS.getState();

  it("gives the window slice its mode and work area", () => {
    media = stubMedia(true);
    mount();
    resize(390, 844);
    expect(state().windows.mode).toBe("fullscreen");
    expect(state().windows.workArea).toEqual(seen.workArea);
    expect(state().windows.workArea).toEqual({ x: 0, y: 32, w: 390, h: 748 });
  });

  it("a mode change reaches open windows", () => {
    os.windows.setAppLookup((id) => ({
      id,
      name: id,
      window: { width: 400, height: 300 },
      capabilities: { maximize: false },
      singleton: true,
    }));
    mount();
    os.windows.openApp("a");
    act(() => media.set(true));
    expect(state().windows.items[0].maximized).toBe(true);
    act(() => media.set(false));
    expect(state().windows.items[0].maximized).toBe(false);
  });

  it("a laptop resize writes nothing", () => {
    mount();
    const before = state().windows;
    resize(720, 450);
    expect(state().windows).toBe(before);
  });

  it("rehydrates settings", () => {
    seedWallpaper();
    mount();
    expect(state().settings.wallpaper).toBe("mono");
  });

  it("a child's plain effect sees settings and the screen", () => {
    seedWallpaper();
    media = stubMedia(true);
    let wallpaper = "";
    let mode = "";
    const note = (w: string, m: string) => {
      wallpaper = w;
      mode = m;
    };
    function Child() {
      useEffect(() => {
        note(
          useOS.getState().settings.wallpaper,
          useOS.getState().windows.mode,
        );
      }, []);
      return null;
    }
    render(
      <Screen>
        <Child />
      </Screen>,
    );
    expect(wallpaper).toBe("mono");
    expect(mode).toBe("fullscreen");
  });
});

function seedWallpaper() {
  localStorage.setItem(
    "beselfos:settings",
    JSON.stringify({ state: { settings: { wallpaper: "mono" } }, version: 0 }),
  );
}
