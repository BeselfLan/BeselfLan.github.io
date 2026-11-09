// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import videoPlayer from "./index";

// defineApp erases the args to unknown, so these call the functions with the
// args the player really gets.
type Args = { projectId: string; title?: string };
const title = (args: Args) => videoPlayer.title!(args);
const instanceKey = (args: Args) => videoPlayer.instanceKey!(args);

describe("the definition", () => {
  it("keeps the placeholder's values", () => {
    expect(videoPlayer).toMatchObject({
      id: "video-player",
      name: "Video Player",
      icon: "/icons/apps/video-player.svg",
      window: { width: 880, height: 540, resizable: false },
      capabilities: { minimize: true, maximize: false, close: true },
      singleton: false,
      dock: null,
      showInAppGrid: false,
    });
    // Cascade placement; only Play opens it, so no default args and no link.
    expect(videoPlayer.window.initialPosition).toBeUndefined();
    expect(videoPlayer.defaultArgs).toBeUndefined();
    expect(videoPlayer.deepLink).toBeUndefined();
  });
});

describe("the title", () => {
  const rows: [string, Args, string][] = [
    [
      "the entry's title",
      {
        projectId: "deadknight",
        title: "DeadKnight -- Roguelite Platformer",
      },
      "DeadKnight -- Roguelite Platformer -- Demo",
    ],
    ["no title falls back to the id", { projectId: "x" }, "x -- Demo"],
    [
      "an empty title falls back to the id",
      { projectId: "x", title: "" },
      "x -- Demo",
    ],
  ];

  it.each(rows)("%s", (_, args, expected) => {
    expect(title(args)).toBe(expected);
  });
});

describe("one window per project", () => {
  it("is keyed by the project", () => {
    expect(instanceKey({ projectId: "fnaf-project", title: "T" })).toBe(
      "fnaf-project",
    );
    expect(instanceKey({ projectId: "deadknight" })).toBe("deadknight");
  });
});

describe("the eager chunk", () => {
  // registry.ts imports index.ts into the page's first chunk, so it must not
  // pull in the component or the content package.
  const COMMENTS = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
  const text = readFileSync(
    fileURLToPath(new URL("./index.ts", import.meta.url)),
    "utf8",
  ).replace(COMMENTS, "");

  it("stays small: index.ts imports react and the contract", () => {
    const lines = [...text.matchAll(/^\s*import\b.*$/gm)].map((m) =>
      m[0].trim(),
    );
    // No side-effect import and no import type slips by the count.
    expect(lines).toHaveLength(2);
    const values = [
      ...text.matchAll(
        /^\s*import\s+(?!type\b)[^;]*?\bfrom\s*["']([^"']+)["']/gm,
      ),
    ].map((m) => m[1]);
    expect(values.sort()).toEqual(["@/os/apps/types", "react"]);
    const dynamic = [
      ...text.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
    ].map((m) => m[1]);
    expect(dynamic).toEqual(["./VideoPlayerApp"]);
    expect(text).not.toMatch(/@beself\/content/);
  });
});
