import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MediaManifestSchema } from "../src/contentSchema.ts";
import { main, type Io } from "../../../scripts/media/manifest-cli.mts";
import {
  checkManifest,
  entryFromProbe,
  readManifest,
  upsert,
  writeManifest,
} from "../../../scripts/media/manifest.mts";

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "media-scripts-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

const entry = (id: string) => entryFromProbe(id, probe);
const probe = {
  streams: [{ width: 62, height: 34 }],
  format: { duration: "1.2345" },
};

/** A folder holding the three files and a manifest that names them. */
function goodFolder(id = "demo"): string {
  const dir = tempDir();
  for (const ext of ["mp4", "webm", "jpg"])
    writeFileSync(join(dir, `${id}.${ext}`), "x");
  writeManifest(join(dir, "manifest.json"), [entry(id)]);
  return dir;
}

describe("entryFromProbe", () => {
  it("builds the convert.sh entry", () => {
    expect(entryFromProbe("demo", probe)).toEqual({
      id: "demo",
      sources: [
        { src: "demo.webm", type: "video/webm; codecs=vp9" },
        { src: "demo.mp4", type: "video/mp4" },
      ],
      poster: "demo.jpg",
      width: 62,
      height: 34,
      durationMs: 1235,
    });
  });

  it("accepts a numeric duration too", () => {
    expect(
      entryFromProbe("demo", { ...probe, format: { duration: 2 } }).durationMs,
    ).toBe(2000);
  });

  it.each([
    ["a bad id", "Bad_Id", probe],
    ["a width of 0", "demo", { ...probe, streams: [{ width: 0, height: 34 }] }],
    ["no streams", "demo", { ...probe, streams: [] }],
    ["no duration", "demo", { ...probe, format: {} }],
    ["a zero duration", "demo", { ...probe, format: { duration: "0" } }],
    ["not an object", "demo", "nope"],
  ])("refuses what the schema refuses: %s", (_name, id, bad) => {
    expect(() => entryFromProbe(id, bad)).toThrow();
  });
});

describe("upsert", () => {
  it("replaces in place, appends, and leaves its input alone", () => {
    const [a, b, c, d] = ["a", "b", "c", "d"].map(entry);
    const input = [a, b, c];
    const b2 = { ...b, width: 100 };

    expect(upsert(input, b2)).toEqual([a, b2, c]);
    expect(upsert(input, d)).toEqual([a, b, c, d]);
    expect(input).toEqual([a, b, c]);
  });
});

describe("readManifest", () => {
  it("reads a missing file as empty", () => {
    expect(readManifest(join(tempDir(), "manifest.json"))).toEqual([]);
  });

  it.each([["{"], ['[{"id":"x"}]']])(
    "throws for %s, naming the file",
    (text) => {
      const file = join(tempDir(), "manifest.json");
      writeFileSync(file, text);
      expect(() => readManifest(file)).toThrow(file);
    },
  );

  it("reads what writeManifest wrote", () => {
    const dir = goodFolder();
    expect(readManifest(join(dir, "manifest.json"))).toEqual([entry("demo")]);
  });
});

describe("writeManifest", () => {
  it("writes two-space JSON with a trailing newline", () => {
    const file = join(tempDir(), "manifest.json");
    writeManifest(file, [entry("demo")]);
    const text = readFileSync(file, "utf8");
    expect(text).toBe(JSON.stringify([entry("demo")], null, 2) + "\n");
    expect(MediaManifestSchema.parse(JSON.parse(text))).toHaveLength(1);
  });

  it("validates first, and an invalid manifest leaves the old file alone", () => {
    const dir = tempDir();
    const file = join(dir, "manifest.json");
    writeManifest(file, [entry("demo")]);
    const before = readFileSync(file);

    const bad = [{ ...entry("other"), id: "Not Kebab" }];
    expect(() => writeManifest(file, bad)).toThrow();
    expect(readFileSync(file).equals(before)).toBe(true);
    expect(readdirSync(dir)).toEqual(["manifest.json"]);
  });

  it("leaves no temp file when the rename fails", () => {
    const dir = tempDir();
    // A folder in the way makes the rename fail after the temp file exists.
    mkdirSync(join(dir, "manifest.json"));
    expect(() =>
      writeManifest(join(dir, "manifest.json"), [entry("demo")]),
    ).toThrow();
    expect(readdirSync(dir)).toEqual(["manifest.json"]);
  });
});

describe("checkManifest", () => {
  it("is empty for a good folder", () => {
    expect(checkManifest(join(goodFolder(), "manifest.json"))).toEqual([]);
  });

  it("finds a duplicate id", () => {
    const dir = goodFolder();
    const file = join(dir, "manifest.json");
    // Written by hand: writeManifest would accept it too, but this is the file a person edits.
    writeFileSync(file, JSON.stringify([entry("demo"), entry("demo")]));
    const problems = checkManifest(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("demo");
  });

  it("finds a missing file", () => {
    const dir = goodFolder();
    rmSync(join(dir, "demo.jpg"));
    const problems = checkManifest(join(dir, "manifest.json"));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("demo.jpg");
  });

  it.each(["../x.mp4", "/etc/passwd", "a/../../x.mp4"])(
    "finds a name that leaves the folder: %s",
    (src) => {
      const dir = goodFolder();
      const file = join(dir, "manifest.json");
      const e = entry("demo");
      writeFileSync(
        file,
        JSON.stringify([
          { ...e, sources: [{ ...e.sources[0], src }, e.sources[1]] },
        ]),
      );
      const problems = checkManifest(file);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain(src);
    },
  );

  it("finds a missing manifest, and a broken one", () => {
    const dir = tempDir();
    const file = join(dir, "manifest.json");
    expect(checkManifest(file)).toHaveLength(1);
    writeFileSync(file, "{");
    expect(checkManifest(file)[0]).toContain(file);
  });
});

describe("manifest-cli main", () => {
  function run(args: string[], stdin = "") {
    const lines = { out: [] as string[], err: [] as string[] };
    const io: Io = {
      stdin: () => stdin,
      out: (l) => lines.out.push(l),
      err: (l) => lines.err.push(l),
    };
    return { code: main(args, io), ...lines };
  }

  it("add writes the entry and prints it", () => {
    const file = join(tempDir(), "manifest.json");
    const result = run(["add", file, "demo"], JSON.stringify(probe));
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out[0])).toEqual(entry("demo"));
    expect(readManifest(file)).toEqual([entry("demo")]);
  });

  it("add replaces an id and keeps the others", () => {
    const file = join(tempDir(), "manifest.json");
    for (const id of ["a", "b", "a"])
      run(["add", file, id], JSON.stringify(probe));
    expect(readManifest(file).map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("check reports each problem and fails", () => {
    const dir = goodFolder();
    rmSync(join(dir, "demo.mp4"));
    const result = run(["check", join(dir, "manifest.json")]);
    expect(result.code).toBe(1);
    expect(result.err.join("\n")).toContain("demo.mp4");
    expect(run(["check", join(goodFolder(), "manifest.json")]).code).toBe(0);
  });

  it.each([
    ["no arguments", []],
    ["an unknown command", ["frob", "x"]],
    ["add without an id", ["add", "x"]],
    ["check with an extra", ["check", "x", "y"]],
  ])("prints usage for %s", (_name, args) => {
    const result = run(args);
    expect(result.code).toBe(1);
    expect(result.err[0]).toMatch(/^manifest: usage/);
  });

  it.each([
    ["bad JSON on stdin", "{", "Bad"],
    ["a bad id", JSON.stringify(probe), "Bad_Id"],
  ])("add reports %s and writes nothing", (_name, stdin, id) => {
    const dir = tempDir();
    const result = run(["add", join(dir, "manifest.json"), id], stdin);
    expect(result.code).toBe(1);
    expect(result.err[0]).toMatch(/^manifest: /);
    expect(existsSync(join(dir, "manifest.json"))).toBe(false);
  });
});

// The scripts, run as a person would run them.
const root = join(import.meta.dirname, "../../..");
const has = (tool: string) =>
  spawnSync("sh", ["-c", `command -v ${tool}`]).status === 0;

// Node first on the PATH, so the scripts run the same Node as the tests.
function script(
  name: string,
  args: string[],
  env: Record<string, string> = {},
) {
  return spawnSync("bash", [join(root, "scripts/media", name), ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${dirname(process.execPath)}:${process.env.PATH}`,
      ...env,
    },
  });
}

function ffprobe(file: string) {
  const out = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,pix_fmt,width,height",
      "-of",
      "json",
      file,
    ],
    { encoding: "utf8" },
  );
  return (JSON.parse(out.stdout) as { streams: Record<string, unknown>[] })
    .streams[0];
}

/** A one-second 63x35 GIF. Odd sides, so the even-size scale matters. */
function makeGif(dir: string): string {
  const gif = join(dir, "src.gif");
  const made = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=63x35:rate=10:duration=1",
      gif,
    ],
    { encoding: "utf8" },
  );
  expect(made.status, made.stderr).toBe(0);
  return gif;
}

describe.skipIf(!has("ffmpeg") || !has("ffprobe"))("convert.sh", () => {
  it("writes mp4, webm and jpg and appends a manifest entry that passes the shared schema", () => {
    const work = tempDir();
    const out = join(work, "media");
    const run = script("convert.sh", [makeGif(work), "demo", out]);
    expect(run.status, run.stderr).toBe(0);

    // Odd 63x35 input: both renditions are scaled to even sides, in yuv420p.
    expect(ffprobe(join(out, "demo.mp4"))).toMatchObject({
      codec_name: "h264",
      pix_fmt: "yuv420p",
      width: 62,
      height: 34,
    });
    expect(ffprobe(join(out, "demo.webm"))).toMatchObject({
      codec_name: "vp9",
      pix_fmt: "yuv420p",
      width: 62,
      height: 34,
    });
    expect(ffprobe(join(out, "demo.jpg"))).toMatchObject({
      width: 62,
      height: 34,
    });

    const manifest = MediaManifestSchema.parse(
      JSON.parse(readFileSync(join(out, "manifest.json"), "utf8")),
    );
    expect(manifest).toHaveLength(1);
    expect(manifest[0]).toMatchObject({
      id: "demo",
      sources: [
        { src: "demo.webm", type: "video/webm; codecs=vp9" },
        { src: "demo.mp4", type: "video/mp4" },
      ],
      poster: "demo.jpg",
      width: 62,
      height: 34,
    });
    expect(manifest[0].durationMs).toBeGreaterThan(900);
    expect(manifest[0].durationMs).toBeLessThan(1100);
    expect(checkManifest(join(out, "manifest.json"))).toEqual([]);

    // The API runs as another user: files are readable and no temp folder stays.
    for (const name of ["demo.mp4", "demo.webm", "demo.jpg", "manifest.json"]) {
      expect(statSync(join(out, name)).mode & 0o777).toBe(0o644);
    }
    expect(readdirSync(out).sort()).toEqual([
      "demo.jpg",
      "demo.mp4",
      "demo.webm",
      "manifest.json",
    ]);
  }, 60_000);

  it("re-running an id replaces its entry", () => {
    const work = tempDir();
    const out = join(work, "media");
    const gif = makeGif(work);
    for (const id of ["a", "b", "a"]) {
      const run = script("convert.sh", [gif, id, out]);
      expect(run.status, run.stderr).toBe(0);
    }
    expect(readManifest(join(out, "manifest.json")).map((e) => e.id)).toEqual([
      "a",
      "b",
    ]);
  }, 120_000);

  it("a bad id stops before any work", () => {
    const work = tempDir();
    const out = join(work, "never");
    const run = script("convert.sh", [makeGif(work), "Bad_Id", out]);
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("Bad_Id");
    expect(existsSync(out)).toBe(false);
  }, 60_000);

  it("a missing input stops before any work", () => {
    const out = join(tempDir(), "never");
    const run = script("convert.sh", [
      join(tempDir(), "nope.gif"),
      "demo",
      out,
    ]);
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("nope.gif");
    expect(existsSync(out)).toBe(false);
  }, 60_000);

  it("a failed encode leaves nothing behind", () => {
    const work = tempDir();
    const out = goodFolder("old");
    const manifest = join(out, "manifest.json");
    const before = readFileSync(manifest);
    const files = readdirSync(out).sort();

    const bad = join(work, "not-a-video.gif");
    writeFileSync(bad, "this is text");
    const run = script("convert.sh", [bad, "demo", out]);

    expect(run.status).not.toBe(0);
    expect(readdirSync(out).sort()).toEqual(files);
    expect(readFileSync(manifest).equals(before)).toBe(true);
  }, 60_000);
});
