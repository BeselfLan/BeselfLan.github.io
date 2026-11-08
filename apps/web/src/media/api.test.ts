// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { API_TIMEOUT_MS, createApiMediaProvider } from "./api";
import type { MediaProvider } from "./provider";

// The API provider needs no location, and in Node the fetch stub, Response,
// ReadableStream and AbortController all come from one implementation.

// What the API sends: absolute URLs, WebM first.
const API_ENTRY = {
  id: "deadknight",
  sources: [
    {
      src: "https://api.test/media/files/deadknight.webm",
      type: "video/webm; codecs=vp9",
    },
    { src: "https://api.test/media/files/deadknight.mp4", type: "video/mp4" },
  ],
  poster: "https://api.test/media/files/deadknight.jpg",
  width: 640,
  height: 360,
  durationMs: 12480,
};

// What the fallback gives, different from the API's, so a test can tell whose
// answer it got.
const FALLBACK_ENTRY = {
  ...API_ENTRY,
  sources: [
    { src: "http://site.test/media/deadknight.mp4", type: "video/mp4" },
  ],
  poster: "http://site.test/media/deadknight.jpg",
};

const NOT_FOUND =
  '{"error":{"code":"media_not_found","message":"Media not found"}}';

// A body can be read once, so every call needs its own Response.
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

function setup(
  answer: (...args: Parameters<typeof fetch>) => Promise<Response>,
  options: { timeoutMs?: number } = {},
) {
  const fetchMock = vi.fn<typeof fetch>(answer);
  const fallback: MediaProvider = {
    resolve: vi.fn(async () => FALLBACK_ENTRY),
    status: () => "online",
  };
  const api = createApiMediaProvider({
    baseUrl: "https://api.test",
    fallback,
    fetch: fetchMock,
    ...options,
  });
  return { api, fetchMock, fallback };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the API media provider", () => {
  it("a 200 is used as it is", async () => {
    const { api, fetchMock, fallback } = setup((input) =>
      Promise.resolve(
        String(input).endsWith("/deadknight")
          ? json(API_ENTRY)
          : new Response(NOT_FOUND, { status: 404 }),
      ),
    );
    expect(api.status()).toBe("unknown");

    await expect(api.resolve("deadknight")).resolves.toEqual(API_ENTRY);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.test/api/media/deadknight");
    expect(new Headers(init?.headers).get("accept")).toBe("application/json");
    expect(init?.signal).toBeDefined();
    expect(init?.signal?.aborted).toBe(false);
    expect(api.status()).toBe("online");
    expect(fallback.resolve).not.toHaveBeenCalled();

    await api.resolve("dead knight");
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api.test/api/media/dead%20knight",
    );
  });

  it("a 404 is unavailable, not offline", async () => {
    const { api, fetchMock, fallback } = setup(() =>
      Promise.resolve(new Response(NOT_FOUND, { status: 404 })),
    );

    await expect(api.resolve("deadknight")).resolves.toBeNull();

    expect(api.status()).toBe("online");
    expect(fallback.resolve).not.toHaveBeenCalled();

    // A 404 is not cached.
    await expect(api.resolve("deadknight")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["a 500", () => Promise.resolve(new Response("", { status: 500 }))],
    ["a 204", () => Promise.resolve(new Response(null, { status: 204 }))],
    ["a rejection", () => Promise.reject(new TypeError("Failed to fetch"))],
    [
      "a body that is not JSON",
      () => Promise.resolve(new Response("not json", { status: 200 })),
    ],
    [
      "relative sources",
      () =>
        Promise.resolve(
          json({
            ...API_ENTRY,
            sources: [{ src: "deadknight.webm", type: "video/webm" }],
          }),
        ),
    ],
    [
      "a relative poster",
      () => Promise.resolve(json({ ...API_ENTRY, poster: "deadknight.jpg" })),
    ],
    [
      "a source that is not http",
      () =>
        Promise.resolve(
          json({
            ...API_ENTRY,
            sources: [
              { src: "ftp://api.test/deadknight.mp4", type: "video/mp4" },
            ],
          }),
        ),
    ],
    [
      "an entry for another id",
      () => Promise.resolve(json({ ...API_ENTRY, id: "3d-engine" })),
    ],
  ])("anything else falls back and is offline: %s", async (_name, answer) => {
    const { api, fallback } = setup(answer);

    await expect(api.resolve("deadknight")).resolves.toEqual(FALLBACK_ENTRY);

    expect(fallback.resolve).toHaveBeenCalledTimes(1);
    expect(fallback.resolve).toHaveBeenCalledWith("deadknight");
    expect(api.status()).toBe("offline");
  });

  it("anything else falls back and is offline: a failure is not cached", async () => {
    const answers = [
      () => new Response("", { status: 500 }),
      () => json(API_ENTRY),
    ];
    let call = 0;
    const { api, fetchMock, fallback } = setup(() =>
      Promise.resolve(answers[call++]()),
    );

    await expect(api.resolve("deadknight")).resolves.toEqual(FALLBACK_ENTRY);
    expect(api.status()).toBe("offline");

    // The API is back: the next resolve asks it again and is online.
    await expect(api.resolve("deadknight")).resolves.toEqual(API_ENTRY);
    expect(api.status()).toBe("online");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fallback.resolve).toHaveBeenCalledTimes(1);
  });

  it("it gives up after 3 s", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    // Settles only when its signal aborts.
    const { api, fetchMock, fallback } = setup(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    expect(API_TIMEOUT_MS).toBe(3000);

    let settled = false;
    const result = api.resolve("deadknight").then((entry) => {
      settled = true;
      return entry;
    });
    const signal = fetchMock.mock.calls[0][1]?.signal;

    await vi.advanceTimersByTimeAsync(2999);
    expect(settled).toBe(false);
    expect(signal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(true);
    expect(settled).toBe(true);
    await expect(result).resolves.toEqual(FALLBACK_ENTRY);
    expect(fallback.resolve).toHaveBeenCalledWith("deadknight");
    expect(api.status()).toBe("offline");
  });

  it("a body that stalls is abandoned at 3 s", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    // The headers arrive at once, the body never ends, and the abort errors it,
    // as a real fetch would.
    const { api, fallback } = setup((_input, init) =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener("abort", () =>
                controller.error(new DOMException("aborted", "AbortError")),
              );
            },
          }),
          { status: 200 },
        ),
      ),
    );

    let settled = false;
    const result = api.resolve("deadknight").then((entry) => {
      settled = true;
      return entry;
    });

    await vi.advanceTimersByTimeAsync(2999);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    await expect(result).resolves.toEqual(FALLBACK_ENTRY);
    expect(fallback.resolve).toHaveBeenCalledTimes(1);
    expect(api.status()).toBe("offline");
  });

  it("the timer is cleared when the answer arrives", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const answers: [string, () => Response][] = [
      ["a 200", () => json(API_ENTRY)],
      ["a 404", () => new Response(NOT_FOUND, { status: 404 })],
      ["a 500", () => new Response("", { status: 500 })],
    ];
    for (const [, answer] of answers) {
      const { api } = setup(() => Promise.resolve(answer()));
      await api.resolve("deadknight");
      expect(vi.getTimerCount()).toBe(0);
    }
  });

  it("a success is cached", async () => {
    const { api, fetchMock } = setup((input) =>
      Promise.resolve(
        String(input).endsWith("/deadknight")
          ? json(API_ENTRY)
          : new Response(NOT_FOUND, { status: 404 }),
      ),
    );

    const first = await api.resolve("deadknight");
    const second = await api.resolve("deadknight");

    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(api.resolve("3d-engine")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reads the global fetch when it is called, as a plain function", async () => {
    const fallback: MediaProvider = {
      resolve: vi.fn(async () => FALLBACK_ENTRY),
      status: () => "online",
    };
    const api = createApiMediaProvider({
      baseUrl: "https://api.test",
      fallback,
    });
    // A browser throws when the global fetch runs as a method of another
    // object; Node does not, so the stub checks `this`.
    const strict = vi.fn(function (this: unknown) {
      if (this !== undefined && this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      return Promise.resolve(json(API_ENTRY));
    });
    vi.stubGlobal("fetch", strict);

    await expect(api.resolve("deadknight")).resolves.toEqual(API_ENTRY);

    expect(strict).toHaveBeenCalledTimes(1);
    expect(api.status()).toBe("online");
    expect(fallback.resolve).not.toHaveBeenCalled();
  });
});
