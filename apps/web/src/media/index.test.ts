import { afterEach, describe, expect, it, vi } from "vitest";
import { pickMediaProvider } from "./index";

// Which provider was picked is read from the URLs it fetches. Every fetch
// rejects, so no test leaves the process, and the API provider falls through to
// the static one, which asks for the manifest. jsdom's location is
// http://localhost:3000/.
const MANIFEST_URL = "http://localhost:3000/media/manifest.json";

const failing = () =>
  vi.fn<typeof fetch>(() => Promise.reject(new TypeError("Failed to fetch")));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("media/index", () => {
  it.each([undefined, "", "   ", "not a url", "ftp://api.test", "/api"])(
    "the static provider is picked for an unset or unusable URL: %j",
    async (apiUrl) => {
      const fetchMock = failing();
      const media = pickMediaProvider(apiUrl, { fetch: fetchMock });

      await expect(media.resolve("deadknight")).resolves.toBeNull();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe(MANIFEST_URL);
    },
  );

  it.each([
    ["https://api.test/", "https://api.test/api/media/deadknight"],
    ["http://localhost:8080", "http://localhost:8080/api/media/deadknight"],
    [" https://api.test/v1/ ", "https://api.test/v1/api/media/deadknight"],
  ])(
    "the API provider is picked for an http or https URL: %j",
    async (apiUrl, first) => {
      const fetchMock = failing();
      const media = pickMediaProvider(apiUrl, { fetch: fetchMock });

      await expect(media.resolve("deadknight")).resolves.toBeNull();

      // The API answers first. When it fails, the fallback uses the same fetch.
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toBe(first);
      expect(fetchMock.mock.calls[1][0]).toBe(MANIFEST_URL);
    },
  );

  it("nothing is fetched until something resolves", () => {
    const fetchMock = failing();

    pickMediaProvider("https://api.test", { fetch: fetchMock });
    pickMediaProvider(undefined, { fetch: fetchMock });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["https://api.test", "https://api.test/api/media/deadknight"],
    ["", MANIFEST_URL],
  ])("the binding reads NEXT_PUBLIC_API_URL: %j", async (env, first) => {
    const fetchMock = failing();
    vi.stubEnv("NEXT_PUBLIC_API_URL", env);
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    const { media } = await import("@/media/index");

    await media.resolve("deadknight");

    expect(fetchMock.mock.calls[0][0]).toBe(first);
  });
});
