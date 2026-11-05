import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("./data/projects");
  vi.resetModules();
});

describe("module load", () => {
  it("parses the placeholder data", async () => {
    const mod = await import("./index");
    expect(mod.content.profile.name).toBeTruthy();
  });

  it("throws on a bad record", async () => {
    vi.resetModules();
    vi.doMock("./data/projects", () => ({ projects: [{ id: "Not Kebab" }] }));
    await expect(import("./index")).rejects.toThrow();
  });
});
