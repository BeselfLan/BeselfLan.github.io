import { describe, expect, it } from "vitest";
import { media } from "@/media/provider";

describe("the placeholder media provider", () => {
  it("resolves nothing and reports an unknown status", async () => {
    await expect(media.resolve("x")).resolves.toBeNull();
    expect(media.status()).toBe("unknown");
  });
});
