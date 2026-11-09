import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  type RenderOptions,
} from "@testing-library/react";
import { StrictMode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { staticContent } from "@/content/static";
import type { MediaProvider, ResolvedMedia } from "@/media/provider";
import type { AppApi } from "@/os/apps/types";
import type { VideoPlayerArgs } from "./index";
import VideoPlayerApp from "./VideoPlayerApp";

// The component with an api of vi.fn()s and the real content. It renders
// outside a Screen, as registry.test.ts does. jsdom implements neither pause,
// load nor play on media elements, so the three are stubbed on the prototype
// before each test (never on an instance after mount).

let pause: MockInstance<() => void>;
let load: MockInstance<() => void>;
let play: MockInstance<() => Promise<void>>;

beforeEach(() => {
  pause = vi
    .spyOn(HTMLMediaElement.prototype, "pause")
    .mockImplementation(() => {});
  load = vi
    .spyOn(HTMLMediaElement.prototype, "load")
    .mockImplementation(() => {});
  play = vi
    .spyOn(HTMLMediaElement.prototype, "play")
    .mockImplementation(() => Promise.resolve());
});
afterEach(() => {
  // Unmount first: the player's cleanup calls pause and load, which must reach
  // the stubs and not jsdom's "not implemented" messages.
  cleanup();
  vi.restoreAllMocks();
});

const FIXTURE: ResolvedMedia = {
  id: "deadknight",
  sources: [
    {
      src: "http://localhost:3000/media/deadknight.webm",
      type: "video/webm; codecs=vp9",
    },
    { src: "http://localhost:3000/media/deadknight.mp4", type: "video/mp4" },
  ],
  poster: "http://localhost:3000/media/deadknight.jpg",
  width: 640,
  height: 360,
  durationMs: 5000,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// A few microtasks inside act(): the resolve runs one microtask late.
const flush = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });

function makeApi(
  resolve: MediaProvider["resolve"] = () => Promise.resolve(FIXTURE),
) {
  let visible: (v: boolean) => void = () => {};
  const unsubscribe = vi.fn();
  const media = { resolve: vi.fn(resolve), status: vi.fn(() => "online") };
  const subscribeVisible = vi.fn((cb: (v: boolean) => void) => {
    visible = cb;
    return unsubscribe;
  });
  const api = {
    close: vi.fn(),
    minimize: vi.fn(),
    focus: vi.fn(),
    setTitle: vi.fn(),
    openApp: vi.fn(),
    notify: vi.fn(),
    isVisible: vi.fn(() => true),
    subscribeVisible,
    bounds: vi.fn(() => ({ width: 880, height: 500 })),
    registerShortcut: vi.fn(() => () => {}),
    content: staticContent,
    media,
  } as unknown as AppApi;
  return {
    api,
    media,
    unsubscribe,
    subscribeVisible,
    setVisible: (v: boolean) => visible(v),
  };
}

const DEADKNIGHT: VideoPlayerArgs = {
  projectId: "deadknight",
  title: "DeadKnight -- Roguelite Platformer",
};

const ui = (api: AppApi, args: VideoPlayerArgs = DEADKNIGHT) => (
  <VideoPlayerApp
    windowId={`video-player:${args.projectId}`}
    args={args}
    api={api}
  />
);

const stateOf = () =>
  document
    .querySelector("[data-video-state]")
    ?.getAttribute("data-video-state");
const video = () => document.querySelector("video");
const sources = () => [...document.querySelectorAll("source")];

// Mounts the player and lets the resolve answer, so it is ready.
async function ready(
  api: AppApi,
  options?: RenderOptions,
  args: VideoPlayerArgs = DEADKNIGHT,
) {
  const view = render(ui(api, args), options);
  await flush();
  expect(stateOf()).toBe("ready");
  return view;
}

describe("the states", () => {
  it("loading while the media resolves", async () => {
    const pending = deferred<ResolvedMedia | null>();
    const { api } = makeApi(() => pending.promise);
    render(ui(api));
    await flush();

    expect(stateOf()).toBe("loading");
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByText("Loading the demo...")).not.toBeNull();
    // The video must not render before its sources exist.
    expect(video()).toBeNull();
  });

  it("the video, with its sources in order", async () => {
    const { api, media } = makeApi();
    await ready(api);

    const el = video()!;
    expect(el.hasAttribute("controls")).toBe(true);
    expect(el.hasAttribute("playsinline")).toBe(true);
    expect(el.getAttribute("preload")).toBe("metadata");
    expect(el.getAttribute("poster")).toBe(FIXTURE.poster);
    // No autoplay: the visitor presses play.
    expect(el.hasAttribute("autoplay")).toBe(false);
    expect(el.getAttribute("aria-label")).toBe(
      "Demo: DeadKnight -- Roguelite Platformer",
    );

    // The manifest's order, WebM first, with no filtering or reordering.
    expect(
      sources().map((s) => ({
        src: s.getAttribute("src"),
        type: s.getAttribute("type"),
      })),
    ).toEqual(FIXTURE.sources);

    expect(
      screen.getAllByRole("heading", { name: /Video Player/ }),
    ).toHaveLength(1);
    expect(media.resolve).toHaveBeenCalledTimes(1);
    expect(media.resolve).toHaveBeenCalledWith("deadknight");
    expect(play).not.toHaveBeenCalled();
  });

  it("the media id comes from the entry", async () => {
    // fnaf-project is the entry; its video is "fnaf".
    expect(staticContent.entry("fnaf-project")?.media?.video).toBe("fnaf");
    const { api, media } = makeApi();
    render(ui(api, { projectId: "fnaf-project" }));
    await flush();

    expect(media.resolve).toHaveBeenCalledTimes(1);
    expect(media.resolve).toHaveBeenCalledWith("fnaf");
  });

  it("the heading is named after the entry, not the args", async () => {
    const { api } = makeApi();
    render(ui(api, { projectId: "deadknight", title: "Ignored" }));
    await flush();
    expect(
      screen.getByRole("heading", {
        name: "Video Player: DeadKnight -- Roguelite Platformer",
      }),
    ).not.toBeNull();
  });

  it("no demo", async () => {
    const { api, media } = makeApi();
    render(ui(api, { projectId: "tetris-asm" }));
    await flush();

    expect(stateOf()).toBe("none");
    expect(screen.getByText("This project has no demo.")).not.toBeNull();
    expect(video()).toBeNull();
    expect(media.resolve).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: /Video Player/ }),
    ).not.toBeNull();
  });

  it("no demo for an unknown project", async () => {
    const { api, media } = makeApi();
    render(ui(api, { projectId: "no-such-project", title: "Ghost" }));
    await flush();

    expect(stateOf()).toBe("none");
    expect(media.resolve).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Video Player: Ghost" }),
    ).not.toBeNull();
  });
});

describe("Demo offline", () => {
  it("Demo offline, then Retry", async () => {
    const second = deferred<ResolvedMedia | null>();
    const { api, media } = makeApi();
    media.resolve
      .mockImplementationOnce(() => Promise.resolve(null))
      .mockImplementationOnce(() => second.promise);
    render(ui(api));
    await flush();

    expect(stateOf()).toBe("offline");
    expect(screen.getByText("Demo offline")).not.toBeNull();
    expect(video()).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await flush();
    // The old answer is never shown for the new attempt.
    expect(stateOf()).toBe("loading");
    expect(media.resolve).toHaveBeenCalledTimes(2);

    await act(async () => {
      second.resolve(FIXTURE);
    });
    await flush();
    expect(stateOf()).toBe("ready");
    expect(video()).not.toBeNull();
    expect(media.resolve).toHaveBeenCalledTimes(2);
  });

  it("a failed resolve is offline: it rejects", async () => {
    const { api } = makeApi(() => Promise.reject(new Error("down")));
    render(ui(api));
    await flush();
    expect(stateOf()).toBe("offline");
    expect(screen.getByRole("button", { name: "Retry" })).not.toBeNull();
  });

  it("a failed resolve is offline: it throws", async () => {
    const { api } = makeApi(() => {
      throw new Error("no provider");
    });
    render(ui(api));
    await flush();
    expect(stateOf()).toBe("offline");
  });
});

describe("a video that fails", () => {
  it("a video that fails shows an error and Retry", async () => {
    const { api, media } = makeApi();
    await ready(api);
    const old = video()!;
    pause.mockClear();
    load.mockClear();

    fireEvent.error(sources().at(-1)!);
    expect(stateOf()).toBe("error");
    expect(screen.getByText("This demo could not load.")).not.toBeNull();
    expect(video()).toBeNull();
    // The unmount stopped the failed element's download.
    expect(pause).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await flush();
    expect(stateOf()).toBe("ready");
    expect(video()).not.toBeNull();
    expect(video()).not.toBe(old);
    expect(media.resolve).toHaveBeenCalledTimes(2);
  });

  it("a video that fails itself shows an error", async () => {
    const { api } = makeApi();
    await ready(api);

    fireEvent.error(video()!);
    expect(stateOf()).toBe("error");
    expect(screen.getByRole("button", { name: "Retry" })).not.toBeNull();
  });

  it("a failed first source is not an error", async () => {
    const { api } = makeApi();
    await ready(api);

    // A WebM that Safari cannot play fails before the MP4 is tried. React
    // passes the source's error up to the video, whose handler must ignore it.
    fireEvent.error(sources()[0]);
    expect(stateOf()).toBe("ready");
    expect(video()).not.toBeNull();
  });
});

describe("hidden and closed", () => {
  it("hidden pauses", async () => {
    const { api, subscribeVisible, setVisible, unsubscribe } = makeApi();
    const { unmount } = await ready(api);
    expect(subscribeVisible).toHaveBeenCalledTimes(1);
    pause.mockClear();

    act(() => setVisible(false));
    expect(pause).toHaveBeenCalledTimes(1);

    act(() => setVisible(true));
    expect(play).not.toHaveBeenCalled();
    expect(pause).toHaveBeenCalledTimes(1);

    expect(unsubscribe).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("hidden before there is a video does nothing", async () => {
    const pending = deferred<ResolvedMedia | null>();
    const { api, setVisible } = makeApi(() => pending.promise);
    render(ui(api));
    await flush();

    expect(() => act(() => setVisible(false))).not.toThrow();
    expect(pause).not.toHaveBeenCalled();
  });

  it("a re-open with new args keeps the video", async () => {
    const { api, media } = makeApi();
    const { rerender } = await ready(api);
    const old = video()!;
    pause.mockClear();
    load.mockClear();

    // A second Play makes the store replace the args with a new object.
    rerender(
      ui(api, {
        projectId: "deadknight",
        title: "DeadKnight -- Roguelite Platformer",
      }),
    );
    await flush();

    expect(video()).toBe(old);
    expect(media.resolve).toHaveBeenCalledTimes(1);
    expect(pause).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(stateOf()).toBe("ready");
  });

  it("closing stops the download", async () => {
    const { api } = makeApi();
    const { unmount } = await ready(api);
    const captured = sources();
    expect(captured).toHaveLength(2);
    pause.mockClear();

    // What the sources hold at the moment load() is called: restarting the
    // resource selection with the sources still set would keep downloading.
    const atLoad: (string | null)[][] = [];
    load.mockImplementation(function (this: HTMLMediaElement) {
      atLoad.push(
        [...this.querySelectorAll("source")].map((s) => s.getAttribute("src")),
      );
    });

    unmount();

    expect(pause).toHaveBeenCalled();
    for (const s of captured) expect(s.hasAttribute("src")).toBe(false);
    expect(atLoad).toEqual([[null, null]]);
  });

  it("a late answer after closing is ignored", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const pending = deferred<ResolvedMedia | null>();
    const { api, media } = makeApi(() => pending.promise);
    const { unmount } = render(ui(api));
    await flush();
    expect(media.resolve).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => {
      pending.resolve(FIXTURE);
    });
    await flush();

    // No act warning and no error; no video was ever mounted.
    expect(error).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
  });
});

describe("Strict Mode", () => {
  it("Strict Mode resolves once", async () => {
    const { api, media } = makeApi();
    render(ui(api), { wrapper: StrictMode });
    await flush();

    expect(stateOf()).toBe("ready");
    expect(media.resolve).toHaveBeenCalledTimes(1);
  });

  it("Strict Mode keeps the sources of the video it mounts", async () => {
    // In development React 19 runs a ref's setup, cleanup and setup again on
    // mount. The cleanup empties the sources, so the second setup must put
    // them back, or the demo would never load under `next dev`.
    const { api } = makeApi();
    await ready(api, { wrapper: StrictMode });

    expect(sources().map((s) => s.getAttribute("src"))).toEqual(
      FIXTURE.sources.map((s) => s.src),
    );
  });
});
