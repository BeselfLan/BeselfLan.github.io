import { afterEach, describe, expect, it, vi } from "vitest";

// Whatever provider `media` is bound to: the placeholder, or the one
// media/index.ts picks once #18 lands. fetch is a stub, so no test leaves the
// process.
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function freshMedia() {
  const fetch = vi.fn(() =>
    Promise.reject(new TypeError("no network in unit tests")),
  );
  vi.stubGlobal("fetch", fetch);
  vi.resetModules();
  const { media } = await import("@/media/provider");
  return { media, fetch };
}

describe("the media binding", () => {
  it("does no I/O on import, and its status is unknown until it resolves", async () => {
    const { media, fetch } = await freshMedia();
    expect(media.status()).toBe("unknown");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("resolves to null, and is not online, when the network fails", async () => {
    const { media } = await freshMedia();
    await expect(media.resolve("deadknight")).resolves.toBeNull();
    expect(media.status()).not.toBe("online");
  });
});
