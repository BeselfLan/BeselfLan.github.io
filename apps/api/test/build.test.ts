import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const apiDir = join(import.meta.dirname, "..");
const tsc = join(apiDir, "../../node_modules/typescript/bin/tsc");
const entryFile = join(apiDir, "dist/apps/api/src/index.js");
const version = JSON.parse(readFileSync(join(apiDir, "package.json"), "utf8"))
  .version as string;

const manifestEntry = {
  id: "demo",
  sources: [{ src: "media/demo.webm", type: "video/webm" }],
  poster: "media/demo.jpg",
  width: 640,
  height: 360,
  durationMs: 1000,
};

const children: ChildProcess[] = [];

// Asks the OS for a free port instead of binding a fixed one.
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

// Only PATH plus the four required keys: every optional key stays unset.
function start(mediaDir: string, port: number): ChildProcess {
  const child = spawn(process.execPath, [entryFile], {
    cwd: apiDir,
    env: {
      PATH: process.env.PATH,
      PORT: String(port),
      CORS_ORIGINS: "https://a.test",
      MEDIA_DIR: mediaDir,
      PUBLIC_MEDIA_BASE_URL: "https://media.test/files",
    },
    stdio: "ignore",
  });
  children.push(child);
  return child;
}

function dirWithManifest(content: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "build-"));
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(content));
  return dir;
}

async function waitForHealth(port: number): Promise<Response> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      return await fetch(`http://127.0.0.1:${port}/health`);
    } catch (err) {
      if (Date.now() > deadline) throw err;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

beforeAll(() => {
  execFileSync(process.execPath, [tsc, "-p", "tsconfig.build.json"], {
    cwd: apiDir,
    stdio: "pipe",
  });
}, 60_000);

afterAll(() => {
  for (const child of children) child.kill();
});

describe("built server", () => {
  it("runs under plain Node", async () => {
    const port = await freePort();
    start(dirWithManifest([manifestEntry]), port);
    const res = await waitForHealth(port);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version, mediaCount: 1 });
  }, 60_000);

  it("stops on a bad manifest", async () => {
    const dir = dirWithManifest([{ ...manifestEntry, id: "Not Kebab" }]);
    const child = start(dir, await freePort());
    const code = await new Promise<number | null>((resolve) => {
      child.once("exit", resolve);
    });
    expect(code).not.toBe(0);
    expect(code).not.toBeNull();
  }, 60_000);
});
