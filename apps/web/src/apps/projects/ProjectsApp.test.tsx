import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { staticContent } from "@/content/static";
import type { AppApi } from "@/os/apps/types";
import { WindowIdContext } from "@/os/window/useWindowVisible";
import type { ProjectsArgs } from "./index";
import ProjectsApp from "./ProjectsApp";

// The component with an api of vi.fn()s and the real content. It renders
// outside a Screen, as registry.test.ts does, and imports nothing from
// os/store: the lint rule keeps apps away from it. The clock is fake (the
// ring's frames are requestAnimationFrame), so no real frame runs after a
// click, and `frames` steps it one act() per frame (see Carousel.test.tsx).

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

const frames = (ms: number) => {
  for (let t = 0; t < ms; t += 16) {
    act(() => {
      vi.advanceTimersByTime(16);
    });
  }
};

// What the fake media gives for a video: absolute URLs, as the real provider's.
const FIXTURE = {
  id: "deadknight",
  sources: [
    { src: "https://example.test/media/deadknight.webm", type: "video/webm" },
  ],
  poster: "https://example.test/media/deadknight.jpg",
  width: 640,
  height: 360,
  durationMs: 1000,
};

// A bare vi.fn() would return undefined, which the panel's Play treats as
// offline. Play's Tooltip is always there, and outside a Screen it renders only
// its control and never shows (#145), so this file needs no Screen for it. The
// default is still that the media resolves, with a status of "unknown", so the
// panel's Play is the working one.
function makeApi(
  content: AppApi["content"] = staticContent,
  resolve: () => Promise<typeof FIXTURE | null> = () =>
    Promise.resolve(FIXTURE),
) {
  const mocks = {
    close: vi.fn(),
    minimize: vi.fn(),
    focus: vi.fn(),
    setTitle: vi.fn(),
    openApp: vi.fn(),
    notify: vi.fn(),
    isVisible: vi.fn(() => true),
    subscribeVisible: vi.fn<AppApi["subscribeVisible"]>(() => () => {}),
    bounds: vi.fn(() => ({ width: 1040, height: 600 })),
    registerShortcut: vi.fn(() => () => {}),
  };
  const api = {
    ...mocks,
    content,
    media: { status: () => "unknown", resolve: vi.fn(resolve) },
  } as unknown as AppApi;
  return { api, mocks };
}

const ui = (api: AppApi, args: ProjectsArgs) => (
  <WindowIdContext value="projects">
    <ProjectsApp windowId="projects" args={args} api={api} />
  </WindowIdContext>
);

// Taken before any test renders, so a test that sorts the shared lists in place
// cannot change what it is compared with.
const BEFORE = {
  all: staticContent.entries().map((e) => e.id),
  featured: staticContent.featuredEntries().map((e) => e.id),
};

const FEATURED = [
  "bash-shell",
  "tetris-asm",
  "trivia-knockouts",
  "todo-fullstack",
  "invoice-creator",
  "painting-ml",
  "deadknight",
  "3d-engine",
  "competitive-programming",
  "portfolio-site",
  "emberhacks",
  "utmist-ai2",
  "thornhill-cs-club",
];

const chip = (name: string) =>
  within(screen.getByRole("group", { name: "Filter" })).getByRole("button", {
    name,
  });
const press = (name: string) => fireEvent.click(chip(name));
const ids = (c: HTMLElement) =>
  [...c.querySelectorAll("[data-entry-id]")].map((e) =>
    e.getAttribute("data-entry-id"),
  );
const item = (c: HTMLElement, id: string) =>
  c.querySelector<HTMLElement>(`[data-entry-id="${id}"]`)!;
const selected = (c: HTMLElement) =>
  [...c.querySelectorAll("[data-selected]")].map((e) =>
    e.getAttribute("data-entry-id"),
  );
const count = (c: HTMLElement) => c.querySelector("[data-count]")?.textContent;
const index = (c: HTMLElement) =>
  c.querySelector("[data-carousel-index]")?.firstChild?.textContent;
const front = (c: HTMLElement) =>
  c.querySelector("[data-front]")?.getAttribute("data-entry-id");
const next = () =>
  fireEvent.click(screen.getByRole("button", { name: "Next item" }));
const pressed = () =>
  Object.fromEntries(
    [
      "Featured",
      "All",
      "Projects",
      "Hackathons",
      "Experience",
      "Volunteer",
    ].map((n) => [n, chip(n).getAttribute("aria-pressed")]),
  );

describe("ProjectsApp", () => {
  it("keeps the Projects heading", () => {
    const { api } = makeApi();
    render(ui(api, {}));
    expect(screen.getAllByRole("heading", { name: "Projects" })).toHaveLength(
      1,
    );
    // Item titles are not headings, so /Projects/ matches only this one.
    expect(screen.getAllByRole("heading", { name: /Projects/ })).toHaveLength(
      1,
    );
  });

  it("opens on Featured", () => {
    const { api } = makeApi();
    const { container } = render(ui(api, {}));
    expect(pressed()).toEqual({
      Featured: "true",
      All: "false",
      Projects: "false",
      Hackathons: "false",
      Experience: "false",
      Volunteer: "false",
    });
    expect(count(container)).toBe("13 items");
    expect(ids(container)).toEqual(FEATURED);
    expect(container.querySelectorAll("[data-selected]")).toHaveLength(0);
  });

  it("labels the chips and announces the count politely", () => {
    const { api } = makeApi();
    const { container } = render(ui(api, {}));
    expect(screen.getByRole("group", { name: "Filter" })).toBeTruthy();
    expect(
      container.querySelector("[data-count]")?.getAttribute("aria-live"),
    ).toBe("polite");
  });

  it("filters with the chips", () => {
    const { api } = makeApi();
    const { container } = render(ui(api, {}));

    press("Hackathons");
    expect(count(container)).toBe("2 items");
    expect(ids(container)).toEqual(["emberhacks", "utmist-ai2"]);
    expect(pressed().Hackathons).toBe("true");
    expect(pressed().Featured).toBe("false");

    press("Experience");
    expect(count(container)).toBe("1 item");
    expect(ids(container)).toEqual(["thornhill-cs-club"]);

    press("Volunteer");
    expect(count(container)).toBe("3 items");

    press("Projects");
    expect(count(container)).toBe("17 items");

    press("All");
    expect(count(container)).toBe("23 items");
    const all = ids(container);
    expect(all).toHaveLength(23);
    expect(all[13]).toBe("kortright-volunteer");
    expect(all[22]).toBe("stock-change-predictor");
  });

  it("draws an icon for featured entries and a tile for the others", () => {
    const { api } = makeApi();
    const { container } = render(ui(api, {}));
    const img = item(container, "bash-shell").querySelector("img");
    expect(img?.getAttribute("src")).toBe("/icons/entries/bash-shell.svg");
    expect(img?.getAttribute("alt")).toBe("");
    expect(container.querySelectorAll("[data-icon-tile]")).toHaveLength(0);

    press("All");
    const pong = item(container, "pong");
    expect(pong.querySelector("[data-icon-tile]")?.textContent).toBe("P");
    expect(pong.querySelector("img")).toBeNull();
    expect(container.querySelectorAll("img")).toHaveLength(13);
    expect(container.querySelectorAll("[data-icon-tile]")).toHaveLength(10);
  });

  it("selects the entry that the args name", () => {
    const { api } = makeApi();
    const { container, unmount } = render(ui(api, { item: "pong" }));
    expect(pressed().All).toBe("true");
    expect(selected(container)).toEqual(["pong"]);
    unmount();

    // An item that is not an entry is ignored, and Featured stays.
    const again = render(ui(api, { item: "nope" }));
    expect(pressed().Featured).toBe("true");
    expect(selected(again.container)).toEqual([]);
  });

  it("starts on the chip that the args name", () => {
    const { api } = makeApi();
    const { container } = render(ui(api, { filter: "volunteer" }));
    expect(pressed().Volunteer).toBe("true");
    expect(count(container)).toBe("3 items");
  });

  it("applies new args when the window is opened again", () => {
    const { api } = makeApi();
    const { container, rerender } = render(ui(api, {}));
    expect(pressed().Featured).toBe("true");

    rerender(ui(api, { item: "emberhacks", filter: "hackathon" }));
    expect(pressed().Hackathons).toBe("true");
    expect(selected(container)).toEqual(["emberhacks"]);
    expect(ids(container)).toEqual(["emberhacks", "utmist-ai2"]);
  });

  it("keeps the visitor's view while the args are the same object", () => {
    const { api } = makeApi();
    const first: ProjectsArgs = { item: "pong" };
    const { container, rerender } = render(ui(api, first));
    press("Projects");
    expect(pressed().Projects).toBe("true");
    expect(selected(container)).toEqual(["pong"]);

    rerender(ui(api, first));
    expect(pressed().Projects).toBe("true");
    expect(selected(container)).toEqual(["pong"]);

    // A new object with the same content is a new open: the view is derived again.
    rerender(ui(api, { item: "pong" }));
    expect(pressed().All).toBe("true");
  });

  it("keeps a selection only while its entry is listed", () => {
    const { api } = makeApi();
    const { container } = render(ui(api, {}));
    press("All");
    fireEvent.click(item(container, "pong"));
    expect(selected(container)).toEqual(["pong"]);

    press("Projects");
    expect(selected(container)).toEqual(["pong"]);

    press("Hackathons");
    expect(selected(container)).toEqual([]);

    // The selection was cleared, not hidden.
    press("All");
    expect(selected(container)).toEqual([]);
  });

  it("selects one entry per click, and a second click keeps it", () => {
    const { api, mocks } = makeApi();
    const { container } = render(ui(api, {}));
    press("Hackathons");
    fireEvent.click(item(container, "utmist-ai2"));
    expect(selected(container)).toEqual(["utmist-ai2"]);

    fireEvent.click(item(container, "emberhacks"));
    expect(selected(container)).toEqual(["emberhacks"]);

    fireEvent.click(item(container, "emberhacks"));
    expect(selected(container)).toEqual(["emberhacks"]);

    // The app never writes its own args, its title or the URL. It does read
    // its visibility, for the ring.
    for (const [name, mock] of Object.entries(mocks)) {
      if (name === "isVisible" || name === "subscribeVisible") continue;
      expect(mock, name).not.toHaveBeenCalled();
    }
  });

  it("says so when a filter lists nothing", () => {
    const empty: AppApi["content"] = {
      ...staticContent,
      entriesByKind: () => ({
        ...staticContent.entriesByKind(),
        volunteer: [],
      }),
    };
    const { api } = makeApi(empty);
    const { container } = render(ui(api, {}));
    press("Volunteer");
    expect(screen.getByText("Nothing here yet.")).toBeTruthy();
    expect(count(container)).toBe("0 items");
    expect(container.querySelectorAll("[data-entry-id]")).toHaveLength(0);
    expect(container.querySelector("[data-carousel]")).toBeNull();
  });

  it("neither sorts the shared lists nor changes the args", () => {
    const { api } = makeApi();
    const args = Object.freeze({ item: "pong" });
    const { container } = render(ui(api, args));
    press("Projects");
    press("All");
    expect(ids(container)).toHaveLength(23);
    expect(staticContent.entries().map((e) => e.id)).toEqual(BEFORE.all);
    expect(staticContent.featuredEntries().map((e) => e.id)).toEqual(
      BEFORE.featured,
    );
    expect(args).toEqual({ item: "pong" });
  });

  it("follows the window's visibility", () => {
    const { api, mocks } = makeApi();
    const unsubscribe = vi.fn();
    let callback: (visible: boolean) => void = () => {};
    mocks.subscribeVisible.mockImplementation((cb) => {
      callback = cb;
      return unsubscribe;
    });
    const { unmount } = render(ui(api, {}));
    expect(mocks.subscribeVisible).toHaveBeenCalledTimes(1);
    expect(unsubscribe).not.toHaveBeenCalled();

    next();
    frames(100);
    expect(vi.getTimerCount()).toBe(1);
    act(() => callback(false));
    expect(vi.getTimerCount()).toBe(0);

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("starts with the ring paused when the window is hidden", () => {
    const { api, mocks } = makeApi();
    mocks.isVisible.mockReturnValue(false);
    const { container } = render(ui(api, {}));
    next();
    expect(index(container)).toBe("2 / 13");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rebuilds the ring for new args", () => {
    const { api } = makeApi();
    const { container, rerender } = render(ui(api, {}));
    expect(index(container)).toBe("1 / 13");

    rerender(ui(api, { item: "utmist-ai2" }));
    expect(front(container)).toBe("utmist-ai2");
    expect(index(container)).toBe("12 / 13");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the ring for the same args object", () => {
    const { api } = makeApi();
    const first: ProjectsArgs = {};
    const { container, rerender } = render(ui(api, first));
    next();
    frames(1000);
    expect(index(container)).toBe("2 / 13");

    // A key that changes on every render would rebuild the ring at item 1.
    rerender(ui(api, first));
    expect(index(container)).toBe("2 / 13");
    expect(front(container)).toBe("tetris-asm");
  });

  it("rebuilds the ring for a chip", () => {
    const { api } = makeApi();
    const { container } = render(ui(api, {}));
    press("Hackathons");
    expect(index(container)).toBe("1 / 2");
    expect(front(container)).toBe("emberhacks");

    press("All");
    expect(index(container)).toBe("1 / 23");
    fireEvent.click(item(container, "pong"));
    frames(1000);
    expect(index(container)).toBe("18 / 23");

    // The selected entry stays in front, with no animation.
    press("Projects");
    expect(front(container)).toBe("pong");
    expect(index(container)).toBe("12 / 17");
    expect(selected(container)).toEqual(["pong"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels the old ring's frame when a chip replaces it", () => {
    const { api } = makeApi();
    const { container } = render(ui(api, {}));
    press("All");
    fireEvent.click(item(container, "pong"));
    frames(100);
    expect(vi.getTimerCount()).toBe(1);
    press("Hackathons");
    expect(vi.getTimerCount()).toBe(0);
    expect(index(container)).toBe("1 / 2");
  });
});

// The detail panel (plan 5.2, 5.4). The panel slides in with motion on real
// frames, which the fake clock above cannot step, so nothing here looks at its
// own transform. It closes at once, with no exit animation.
const panel = (c: HTMLElement) =>
  c.querySelector<HTMLElement>("[data-detail-panel]");
const shift = (c: HTMLElement) =>
  c.querySelector<HTMLElement>("[data-carousel]")?.style.transform;
const heading = (c: HTMLElement) => panel(c)?.querySelector("h3")?.textContent;
const frontItem = (c: HTMLElement) =>
  c.querySelector<HTMLElement>("[data-front]")!;
const closeButton = () => screen.getByRole("button", { name: "Close details" });

describe("ProjectsApp detail panel", () => {
  it("opens beside the ring when an item is selected", () => {
    const { api } = makeApi();
    const { container } = render(ui(api, {}));
    expect(panel(container)).toBeNull();
    expect(shift(container)).toBe("translateX(0px)");

    fireEvent.click(item(container, "tetris-asm"));
    expect(heading(container)).toBe("Tetris in MIPS Assembly (MARS)");
    expect(shift(container)).toBe("translateX(190px)");
    // Beside the stage, never inside it.
    expect(
      container.querySelector("[data-carousel] [data-detail-panel]"),
    ).toBeNull();
    expect(panel(container)?.parentElement).toBe(
      container.querySelector("[data-carousel]")?.parentElement?.parentElement,
    );
  });

  it("opens for an item link", () => {
    const { api } = makeApi();
    const { container } = render(ui(api, { item: "tetris-asm" }));
    expect(heading(container)).toBe("Tetris in MIPS Assembly (MARS)");
    expect(shift(container)).toBe("translateX(190px)");
  });

  it("updates in place for a new selection", () => {
    const { api } = makeApi();
    const { container } = render(ui(api, {}));
    press("All");
    fireEvent.click(item(container, "pong"));
    const first = panel(container);
    expect(heading(container)).toBe("Pong");

    fireEvent.click(item(container, "bash-shell"));
    expect(panel(container)).toBe(first);
    expect(heading(container)).toBe("Bash Terminal Recreation in C");
  });

  it("stays open while a chip keeps the selection, and closes when it clears it", () => {
    const { api } = makeApi();
    const { container } = render(ui(api, {}));
    press("All");
    fireEvent.click(item(container, "pong"));
    press("Projects");
    expect(heading(container)).toBe("Pong");
    expect(shift(container)).toBe("translateX(190px)");

    press("Hackathons");
    expect(panel(container)).toBeNull();
    expect(shift(container)).toBe("translateX(0px)");
  });

  it("closes from the X and gives focus back to the front item", () => {
    const { api } = makeApi();
    const { container } = render(ui(api, { item: "tetris-asm" }));
    expect(panel(container)).not.toBeNull();

    fireEvent.click(closeButton());
    // At once: there is no exit animation to wait for.
    expect(panel(container)).toBeNull();
    expect(container.querySelectorAll("[data-selected]")).toHaveLength(0);
    expect(shift(container)).toBe("translateX(0px)");
    expect(document.activeElement).toBe(frontItem(container));
    expect(document.activeElement?.getAttribute("data-entry-id")).toBe(
      "tetris-asm",
    );
  });

  it("closes from a plain Escape, and only while it is open", () => {
    const { api } = makeApi();
    const { container } = render(ui(api, { item: "tetris-asm" }));
    const front = frontItem(container);

    // A key with a modifier, or in a composition, is not the visitor's Escape.
    for (const init of [
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
      { shiftKey: true },
      { isComposing: true },
    ]) {
      const label = JSON.stringify(init);
      expect(fireEvent.keyDown(front, { key: "Escape", ...init }), label).toBe(
        true,
      );
      expect(panel(container), label).not.toBeNull();
    }

    // An Escape that something below already took (a popup, say) is theirs.
    const taken = (e: Event) => e.preventDefault();
    front.addEventListener("keydown", taken);
    expect(fireEvent.keyDown(front, { key: "Escape" })).toBe(false);
    expect(panel(container)).not.toBeNull();
    front.removeEventListener("keydown", taken);

    // Prevented, so that the OS's Escape (close all) skips it.
    expect(fireEvent.keyDown(front, { key: "Escape" })).toBe(false);
    expect(panel(container)).toBeNull();
    expect(container.querySelectorAll("[data-selected]")).toHaveLength(0);
    expect(shift(container)).toBe("translateX(0px)");
    expect(document.activeElement).toBe(frontItem(container));

    // With nothing open, Escape is left alone for the App Grid and the OS.
    expect(fireEvent.keyDown(frontItem(container), { key: "Escape" })).toBe(
      true,
    );
    expect(fireEvent.keyDown(chip("All"), { key: "Escape" })).toBe(true);
  });

  it("hears Escape on a control in the panel and on a chip", () => {
    const { api } = makeApi();
    const { container } = render(ui(api, { item: "tetris-asm" }));
    expect(fireEvent.keyDown(closeButton(), { key: "Escape" })).toBe(false);
    expect(panel(container)).toBeNull();

    fireEvent.click(item(container, "tetris-asm"));
    expect(panel(container)).not.toBeNull();
    expect(fireEvent.keyDown(chip("All"), { key: "Escape" })).toBe(false);
    expect(panel(container)).toBeNull();
  });

  describe("focus", () => {
    // jsdom does not focus a button on a click, as Safari does not, so a click
    // here is a selection with focus wherever it was.
    it("a selection with focus outside the app focuses the panel", () => {
      const { api } = makeApi();
      const { container } = render(ui(api, {}));
      expect(document.activeElement).toBe(document.body);

      fireEvent.click(item(container, "tetris-asm"));
      expect(panel(container)).not.toBeNull();
      expect(document.activeElement).toBe(panel(container));

      // Escape heard on the panel closes it, and the front item gets focus.
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
      expect(panel(container)).toBeNull();
      expect(document.activeElement).toBe(frontItem(container));
    });

    it("a selection from inside the app keeps focus", () => {
      const { api } = makeApi();
      const { container } = render(ui(api, {}));
      const front = frontItem(container);
      act(() => front.focus());

      // What Enter on the item does, and what a Chromium click does after it
      // focused the item.
      fireEvent.click(front);
      expect(panel(container)).not.toBeNull();
      expect(document.activeElement).toBe(front);
    });

    it("a deep-linked item starts with focus in the panel", () => {
      const { api } = makeApi();
      const { container } = render(ui(api, { item: "deadknight" }));
      expect(document.activeElement).toBe(panel(container));
    });

    it("focus in the window's title bar is outside the app", () => {
      // The desktop may put focus on the title bar's Minimise when it opens
      // the window (#146). That is not inside the app's own root.
      const { api } = makeApi();
      const { container } = render(
        <div data-window-id="projects">
          <button>Minimise</button>
          <div data-window-content="">{ui(api, {})}</div>
        </div>,
      );
      act(() => screen.getByRole("button", { name: "Minimise" }).focus());

      fireEvent.click(item(container, "tetris-asm"));
      expect(document.activeElement).toBe(panel(container));
    });

    it("is not a Tab stop", () => {
      const { api } = makeApi();
      const { container } = render(ui(api, { item: "deadknight" }));
      expect(panel(container)?.getAttribute("tabindex")).toBe("-1");
    });
  });

  it("says what the items control", () => {
    const { api } = makeApi();
    const { container } = render(ui(api, { item: "tetris-asm" }));
    const id = panel(container)!.id;
    expect(id).not.toBe("");
    for (const el of container.querySelectorAll("[data-entry-id]")) {
      const open = el.getAttribute("data-entry-id") === "tetris-asm";
      expect(el.getAttribute("aria-expanded"), el.textContent).toBe(
        String(open),
      );
      expect(el.getAttribute("aria-controls"), el.textContent).toBe(
        open ? id : null,
      );
    }

    // Closed, every item still says so, and none points anywhere.
    fireEvent.click(closeButton());
    for (const el of container.querySelectorAll("[data-entry-id]")) {
      expect(el.getAttribute("aria-expanded")).toBe("false");
      expect(el.hasAttribute("aria-controls")).toBe(false);
    }
  });

  it("never adds a second heading that matches /Projects/", () => {
    // registry.test.ts looks the app's heading up by /Projects/. A title or a
    // panel subheading with that word would break it for that entry. The media
    // never settles here, so no state is set after a test step.
    const { api } = makeApi(staticContent, () => new Promise(() => {}));
    for (const entry of staticContent.entries()) {
      const { container, unmount } = render(ui(api, { item: entry.id }));
      expect(panel(container), entry.id).not.toBeNull();
      expect(
        screen.getAllByRole("heading", { name: /Projects/ }),
        entry.id,
      ).toHaveLength(1);
      unmount();
    }
  });

  it("asks the media for a video only when its entry is open", async () => {
    const { api } = makeApi();
    const { container } = render(ui(api, {}));
    fireEvent.click(item(container, "tetris-asm"));
    expect(api.media.resolve).not.toHaveBeenCalled();

    fireEvent.click(item(container, "deadknight"));
    // Promises settle in microtasks, which act() runs.
    await act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(api.media.resolve).toHaveBeenCalledTimes(1);
    expect(api.media.resolve).toHaveBeenCalledWith("deadknight");
    expect(
      screen.getByRole("button", { name: "Play demo" }).dataset.media,
    ).toBe("ready");
  });
});
