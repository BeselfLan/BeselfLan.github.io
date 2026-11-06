import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalDisk } from "../src/storage/localDisk.ts";

let tmp: string;
let root: string;
const BASE = "https://media.test/files";

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "disk-"));
  root = join(tmp, "media");
  mkdirSync(root);
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("local disk", () => {
  it("round trip", async () => {
    const disk = createLocalDisk(root, BASE);
    writeFileSync(join(root, "other.txt"), "o");
    await disk.putStream("a/b.txt", Readable.from(["hello"]));
    expect(await disk.exists("a/b.txt")).toBe(true);
    expect(await disk.list()).toContain("a/b.txt");
    expect(readFileSync(join(root, "a/b.txt"), "utf8")).toBe("hello");
    expect(await disk.exists("nope")).toBe(false);
    expect(await disk.exists("a")).toBe(false);
  });

  it("refuses paths outside the media dir", async () => {
    const outside = join(tmp, "outside.txt");
    writeFileSync(outside, "keep");
    const disk = createLocalDisk(root, BASE);
    expect(await disk.exists("../outside.txt")).toBe(false);
    await expect(
      disk.putStream("../outside.txt", Readable.from(["x"])),
    ).rejects.toThrow();
    expect(readFileSync(outside, "utf8")).toBe("keep");
  });

  it("refuses a sibling folder that shares the prefix", async () => {
    const sibling = `${root}-old`;
    mkdirSync(sibling);
    writeFileSync(join(sibling, "x.txt"), "keep");
    const key = `../${basename(root)}-old/x.txt`;
    const disk = createLocalDisk(root, BASE);
    expect(await disk.exists(key)).toBe(false);
    await expect(disk.putStream(key, Readable.from(["x"]))).rejects.toThrow();
    expect(readFileSync(join(sibling, "x.txt"), "utf8")).toBe("keep");
  });

  it("refuses an absolute path", async () => {
    const outside = join(tmp, "outside.txt");
    writeFileSync(outside, "keep");
    expect(await createLocalDisk(root, BASE).exists(resolve(outside))).toBe(
      false,
    );
  });

  it("lists nested files with forward slashes", async () => {
    const disk = createLocalDisk(root, BASE);
    await disk.putStream("a/b.txt", Readable.from(["x"]));
    const keys = await disk.list();
    expect(keys).toContain("a/b.txt");
    expect(keys).not.toContain("a");
    expect(await createLocalDisk(join(tmp, "missing"), BASE).list()).toEqual(
      [],
    );
  });

  it.each([BASE, `${BASE}/`])("builds public URLs: %s", (base) => {
    expect(createLocalDisk(root, base).publicUrl("a.mp4")).toBe(
      `${BASE}/a.mp4`,
    );
  });

  it("encodes each path segment", () => {
    expect(createLocalDisk(root, BASE).publicUrl("a b/c#d.mp4")).toBe(
      `${BASE}/a%20b/c%23d.mp4`,
    );
  });
});
