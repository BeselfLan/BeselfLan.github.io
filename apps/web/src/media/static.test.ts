import { afterEach, describe, expect, it, vi } from "vitest";
import { createStaticMediaProvider } from "./static";

// The manifest as the site ships it (plan 5.6): names relative to the
// manifest's folder, WebM first. Written out in full so a test fails on the
// data, not on a helper that builds it. jsdom's location is
// http://localhost:3000/.
const MANIFEST = [
  {
    id: "deadknight",
    sources: [
      { src: "deadknight.webm", type: "video/webm; codecs=vp9" },
      { src: "deadknight.mp4", type: "video/mp4" },
    ],
    poster: "deadknight.jpg",
    width: 640,
    height: 360,
    durationMs: 12480,
  },
  {
    id: "3d-engine",
    sources: [
      { src: "3d-engine.webm", type: "video/webm; codecs=vp9" },
      { src: "3d-engine.mp4", type: "video/mp4" },
    ],
    poster: "3d-engine.jpg",
    width: 480,
    height: 270,
    durationMs: 6200,
  },
];

// A body can be read once, so every call needs its own Response.
const ok = () => new Response(JSON.stringify(MANIFEST), { status: 200 });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the static media provider", () => {
  it("names resolve against the manifest's folder", async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(ok()));
    const media = createStaticMediaProvider({
      fetch: fetchMock,
      manifestPath: "http://site.test/media/manifest.json",
    });

    await expect(media.resolve("deadknight")).resolves.toEqual({
      id: "deadknight",
      sources: [
        {
          src: "http://site.test/media/deadknight.webm",
          type: "video/webm; codecs=vp9",
        },
        { src: "http://site.test/media/deadknight.mp4", type: "video/mp4" },
      ],
      poster: "http://site.test/media/deadknight.jpg",
      width: 640,
      height: 360,
      durationMs: 12480,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://site.test/media/manifest.json",
    );
  });

  it("fetches the manifest once", async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(ok()));
    const media = createStaticMediaProvider({ fetch: fetchMock });

    const [a, b] = await Promise.all([
      media.resolve("deadknight"),
      media.resolve("3d-engine"),
    ]);
    const again = await media.resolve("deadknight");

    expect(a?.id).toBe("deadknight");
    expect(b?.id).toBe("3d-engine");
    expect(again).toEqual(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("unknown, then online", async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(ok()));
    const media = createStaticMediaProvider({ fetch: fetchMock });
    expect(media.status()).toBe("unknown");
    expect(fetchMock).not.toHaveBeenCalled();

    await media.resolve("deadknight");

    expect(media.status()).toBe("online");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://localhost:3000/media/manifest.json",
    );
  });

  it("an id not in the manifest is null, and the status stays online", async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(ok()));
    const media = createStaticMediaProvider({ fetch: fetchMock });

    await expect(media.resolve("fnaf")).resolves.toBeNull();

    expect(media.status()).toBe("online");
  });

  it("the first entry with an id wins", async () => {
    const twice = [
      { ...MANIFEST[0], width: 100 },
      { ...MANIFEST[0], width: 200 },
    ];
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify(twice))),
    );
    const media = createStaticMediaProvider({ fetch: fetchMock });

    expect((await media.resolve("deadknight"))?.width).toBe(100);
  });

  it.each([
    ["a 404", () => Promise.resolve(new Response("", { status: 404 }))],
    ["a rejection", () => Promise.reject(new TypeError("Failed to fetch"))],
    [
      "a body that is not JSON",
      () => Promise.resolve(new Response("not json")),
    ],
    [
      "a body that is not a manifest",
      () => Promise.resolve(new Response('[{ "id": "x" }]')),
    ],
    [
      "a fetch that throws at once",
      () => {
        throw new TypeError("Illegal invocation");
      },
    ],
  ])(
    "a failed manifest is offline, and the next resolve tries again: %s",
    async (_name, first) => {
      const fetchMock = vi
        .fn<typeof fetch>(() => Promise.resolve(ok()))
        .mockImplementationOnce(first);
      const media = createStaticMediaProvider({ fetch: fetchMock });

      await expect(media.resolve("deadknight")).resolves.toBeNull();
      expect(media.status()).toBe("offline");

      const retry = await media.resolve("deadknight");
      expect(retry?.id).toBe("deadknight");
      expect(media.status()).toBe("online");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it("reads the global fetch when it is called, as a plain function", async () => {
    const media = createStaticMediaProvider();
    // A browser throws when the global fetch runs as a method of another
    // object; Node does not, so the stub checks `this`.
    const strict = vi.fn(function (this: unknown) {
      if (this !== undefined && this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      return Promise.resolve(ok());
    });
    vi.stubGlobal("fetch", strict);

    const entry = await media.resolve("deadknight");

    expect(entry?.id).toBe("deadknight");
    expect(media.status()).toBe("online");
    expect(strict).toHaveBeenCalledTimes(1);
  });
});
