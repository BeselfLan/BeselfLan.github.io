// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createStaticMediaProvider } from "./static";

describe("the static media provider on the server", () => {
  it("without location it resolves nothing", async () => {
    // The guard that keeps this test from passing in the wrong environment.
    expect(typeof location).toBe("undefined");
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response("[]", { status: 200 })),
    );
    const media = createStaticMediaProvider({ fetch: fetchMock });

    await expect(media.resolve("deadknight")).resolves.toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(media.status()).toBe("unknown");
  });
});
