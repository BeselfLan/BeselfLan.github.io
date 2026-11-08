// @vitest-environment node
import { describe, expect, it } from "vitest";

describe("the providers on the server", () => {
  it("import and answer with no window or document", async () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    const { staticContent } = await import("@/content/static");
    const { media } = await import("@/media/provider");
    expect(staticContent.profile().name).toBeTruthy();
    expect(staticContent.bootGroups()).toBe(staticContent.bootGroups());
    expect(media.status()).toBe("unknown");
  });
});
