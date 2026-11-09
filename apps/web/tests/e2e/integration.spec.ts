import { content } from "@beself/content";
import { expect, test } from "@playwright/test";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

// The whole site against the production build (#23): boot, every app, the
// Play demo, the chips both ways, minimise, a power cycle, the noscript
// fallback, and a scan of the built output for phone numbers and addresses.
//
// The tests load the static export (apps/web/out) from a small server of their
// own, the way GitHub Pages would serve it, and never use `next dev`. So the
// export has to be built first, and fresh: `npm run build -w apps/web`. The
// server listens on an ephemeral loopback port, so sessions on one host never
// collide. Once #27 points `webServer` at the export, drop this server and use
// `baseURL` (plan call 1).

const { profile } = content;

test.use({
  viewport: { width: 1440, height: 900 },
  // About's Copy email writes to the clipboard.
  permissions: ["clipboard-read", "clipboard-write"],
});

// -- The export server ------------------------------------------------------

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

/** The file Pages would serve for a URL, or null for a 404. */
async function resolveFile(root: string, url: string): Promise<string | null> {
  let pathname: string;
  try {
    pathname = decodeURIComponent(
      new URL(url, "http://export.invalid").pathname,
    );
  } catch {
    return null;
  }
  const target = path.resolve(root, `.${pathname}`);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  try {
    const info = await stat(target);
    if (info.isFile()) return target;
    if (!info.isDirectory()) return null;
    const index = path.join(target, "index.html");
    return (await stat(index)).isFile() ? index : null;
  } catch {
    return null;
  }
}

type ByteRange = { start: number; end: number };

/**
 * One `bytes=a-b`, `a-` or `-n`. A malformed or multiple range is ignored, as
 * the spec allows; a range outside the file is "unsatisfiable" (416).
 */
function parseRange(
  header: string | undefined,
  size: number,
): ByteRange | "unsatisfiable" | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? "");
  if (m === null || (m[1] === "" && m[2] === "")) return null;
  let start: number;
  let end: number;
  if (m[1] === "") {
    const last = Number(m[2]);
    if (last === 0) return "unsatisfiable";
    start = Math.max(0, size - last);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  return start >= size || start > end ? "unsatisfiable" : { start, end };
}

async function serve(
  root: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const method = req.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  const found = await resolveFile(root, req.url ?? "/");
  const missing = path.join(root, "404.html");
  const file = found ?? missing;
  let status = found === null ? 404 : 200;
  const info = await stat(file).catch(() => null);
  if (info === null) {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    return;
  }

  const headers: Record<string, string | number> = {
    "Content-Type":
      MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
  };
  const range =
    found === null ? null : parseRange(req.headers.range, info.size);
  let slice: ByteRange | undefined;
  if (range === "unsatisfiable") {
    res.writeHead(416, { ...headers, "Content-Range": `bytes */${info.size}` });
    res.end();
    return;
  }
  if (range !== null) {
    status = 206;
    slice = range;
    headers["Content-Range"] = `bytes ${range.start}-${range.end}/${info.size}`;
    headers["Content-Length"] = range.end - range.start + 1;
  } else {
    headers["Content-Length"] = info.size;
  }
  res.writeHead(status, headers);
  if (method === "HEAD") {
    res.end();
    return;
  }
  const stream = createReadStream(file, slice);
  // An aborted request (the player cancels its download on close) must not
  // leave a stream behind or throw.
  res.on("close", () => stream.destroy());
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}

async function startExportServer(
  root: string,
): Promise<{ server: http.Server; origin: string }> {
  const server = http.createServer((req, res) => {
    serve(root, req, res).catch(() => {
      if (res.headersSent) res.destroy();
      else res.writeHead(500).end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  return { server, origin: `http://127.0.0.1:${port}` };
}

// -- The build must be there, and fresh -------------------------------------

/** The newest source file that ships, skipping tests and the dev-only route. */
async function newestSource(
  webRoot: string,
): Promise<{ file: string; mtimeMs: number }> {
  const repoRoot = path.resolve(webRoot, "..", "..");
  let newest = { file: "", mtimeMs: 0 };
  const consider = async (file: string) => {
    const { mtimeMs } = await stat(file);
    if (mtimeMs > newest.mtimeMs) newest = { file, mtimeMs };
  };
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (!/\.(test|dev)\./.test(entry.name)) await consider(full);
    }
  };
  await walk(path.join(webRoot, "src"));
  await walk(path.join(webRoot, "public"));
  await walk(path.join(repoRoot, "packages", "content", "src"));
  await consider(path.join(webRoot, "next.config.ts"));
  return {
    file: path.relative(repoRoot, newest.file),
    mtimeMs: newest.mtimeMs,
  };
}

async function assertFreshExport(webRoot: string): Promise<void> {
  const rebuild = "run npm run build -w apps/web";
  const index = await stat(path.join(webRoot, "out", "index.html")).catch(
    () => null,
  );
  if (index === null) {
    throw new Error(
      `apps/web/out is missing or older than the sources (no out/index.html); ${rebuild}`,
    );
  }
  const newest = await newestSource(webRoot);
  if (newest.mtimeMs > index.mtimeMs) {
    throw new Error(
      `apps/web/out is missing or older than ${newest.file}; ${rebuild}`,
    );
  }
}

let outDir = "";
let origin = "";
let exportServer: http.Server | undefined;

test.beforeAll(async ({}, testInfo) => {
  // testDir is apps/web/tests/e2e, whatever the working directory.
  const webRoot = path.resolve(testInfo.project.testDir, "..", "..");
  await assertFreshExport(webRoot);
  outDir = path.join(webRoot, "out");
  ({ server: exportServer, origin } = await startExportServer(outDir));
});

test.afterAll(async () => {
  if (exportServer === undefined) return;
  exportServer.closeAllConnections();
  await new Promise<void>((resolve) => exportServer!.close(() => resolve()));
});

// -- The scan -----------------------------------------------------------------

// A finding names where it is and which detector fired, and never the text it
// matched: CI logs on this public repo are public (D18).
type Finding = { path: string; offset: number; pattern: string };
const show = (f: Finding): string => `${f.path}:${f.offset} (${f.pattern})`;

// The shapes of a phone number in code and data. A bare run of digits is not
// one of them: minified code holds 10-digit integer constants. The HTML text
// is checked for bare runs below, where a visitor would read them.
const DETECTORS: { pattern: string; re: RegExp; notIn?: string }[] = [
  {
    pattern: "formatted",
    re: /(?<![\w.+-])(?:\+1[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[.-])\d{3}[.-]\d{4}(?![\w.-])/g,
  },
  {
    pattern: "international",
    re: /\+1[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g,
  },
  // SVG path data has space-separated triples of digits.
  {
    pattern: "spaced",
    re: /(?<![\w.])\d{3} \d{3} \d{4}(?![\w.])/g,
    notIn: ".svg",
  },
  // A bare `tel:` would match react-dom's input-type table.
  { pattern: "tel-link", re: /\btel:\s*[+\d(]/gi },
];

// The detectors from packages/content/src/content.test.ts, as about.spec.ts
// copies them.
const phoneShaped = (s: string): boolean =>
  /(?:\+?\d[\s().-]*){10,}|(?:\d[^A-Za-z0-9]{0,3}){9,}\d/.test(s);
const streetShaped = (s: string): boolean =>
  /\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,3}(?:Dr|Drive|Ave|Avenue|St|Street|Rd|Road|Blvd|Boulevard|Cres|Crescent|Ct|Court|Way|Lane|Ln)\b/.test(
    s,
  );

/** Every detector over one text file. At most 5 findings per detector. */
function scanText(rel: string, text: string): Finding[] {
  return DETECTORS.filter(
    (d) => d.notIn === undefined || !rel.endsWith(d.notIn),
  ).flatMap((d) =>
    [...text.matchAll(d.re)]
      .slice(0, 5)
      .map((m) => ({ path: rel, offset: m.index, pattern: d.pattern })),
  );
}

/**
 * The text between the tags of an HTML file, one run each, with `<script>` and
 * `<style>` blanked out (so offsets stay the file's own) and every entity
 * replaced by a space.
 */
function htmlTextRuns(html: string): { offset: number; text: string }[] {
  const blanked = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, (block) =>
    " ".repeat(block.length),
  );
  const runs: { offset: number; text: string }[] = [];
  for (const m of blanked.matchAll(/<[^>]*>|[^<]+/g)) {
    if (m[0].startsWith("<")) continue;
    runs.push({
      offset: m.index,
      text: m[0].replace(/&(?:#\d+|#x[\da-f]+|[a-z][a-z\d]*);/gi, " "),
    });
  }
  return runs;
}

/** Phone and street shapes in what a visitor would read in an HTML file. */
function scanHtmlText(rel: string, html: string): Finding[] {
  return htmlTextRuns(html).flatMap((run) => [
    ...(phoneShaped(run.text)
      ? [{ path: rel, offset: run.offset, pattern: "html-text-phone" }]
      : []),
    ...(streetShaped(run.text)
      ? [{ path: rel, offset: run.offset, pattern: "html-text-street" }]
      : []),
  ]);
}

// Text files are scanned. A binary type is skipped. Any other type fails the
// test, so a new text type cannot slip past unscanned: add it to a set. The
// extension of `.nojekyll` is "".
const TEXT_TYPES = new Set([
  "",
  ".html",
  ".txt",
  ".js",
  ".css",
  ".json",
  ".svg",
  ".xml",
  ".webmanifest",
]);
const BINARY_TYPES = new Set([
  ".woff2",
  ".woff",
  ".ico",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".mp4",
  ".webm",
]);

/** Every file under a folder, as POSIX paths relative to it. */
async function listFiles(root: string, dir = root): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await listFiles(root, full)));
    else found.push(path.relative(root, full).split(path.sep).join("/"));
  }
  return found.sort();
}

/** The detectors fire on shapes and not on dates, so a pass means something. */
function selfCheck(): void {
  // Built at runtime: the repo never holds a phone-shaped literal.
  const d = (k: number) => "9".repeat(k);
  const shapes: Record<string, string> = {
    dashed: [d(3), d(3), d(4)].join("-"),
    dotted: [d(3), d(3), d(4)].join("."),
    parenthesised: `(${d(3)}) ${d(3)}-${d(4)}`,
    international: `+1 ${d(3)} ${d(3)} ${d(4)}`,
    spaced: [d(3), d(3), d(4)].join(" "),
    telLink: `tel:+1${d(10)}`,
  };
  for (const [name, shape] of Object.entries(shapes)) {
    expect(scanText("probe.js", shape), name).not.toEqual([]);
  }
  // SVG path data has triples of digits.
  expect(scanText("probe.svg", shapes.spaced)).toEqual([]);

  for (const harmless of ["2021-2024", "2023-11-08", "U+0100-024F"]) {
    expect(scanText("probe.js", harmless), harmless).toEqual([]);
  }

  // A bare run is caught in HTML text only.
  expect(scanText("probe.js", d(10))).toEqual([]);
  expect(scanHtmlText("probe.html", `<p>${d(10)}</p>`)).toHaveLength(1);
  expect(
    scanHtmlText("probe.html", `<script>var n=${d(10)}</script><p>hi</p>`),
  ).toEqual([]);
  expect(scanHtmlText("probe.html", `<p>12 Sample Road</p>`)).toHaveLength(1);
  // A finding names the place and the detector, and not the text.
  const [finding] = scanHtmlText("probe.html", `<p>${d(10)}</p>`);
  expect(show(finding)).toBe("probe.html:3 (html-text-phone)");
}

test("the built output holds no phone-number or street-address shapes", async () => {
  selfCheck();
  const files = await listFiles(outDir);
  const findings: Finding[] = [];
  const unknown: string[] = [];
  let scanned = 0;
  let emailInHtmlText = false;
  let emailInScript = false;
  let chunk = false;

  for (const rel of files) {
    const ext = path.extname(rel).toLowerCase();
    if (BINARY_TYPES.has(ext)) continue;
    if (!TEXT_TYPES.has(ext)) {
      unknown.push(rel);
      continue;
    }
    const text = await readFile(path.join(outDir, rel), "utf8");
    scanned++;
    findings.push(...scanText(rel, text));
    if (ext === ".html") {
      findings.push(...scanHtmlText(rel, text));
      if (
        rel === "index.html" &&
        htmlTextRuns(text).some((run) => run.text.includes(profile.email))
      ) {
        emailInHtmlText = true;
      }
    }
    if (ext === ".js" && rel.startsWith("_next/static/")) {
      chunk = true;
      if (text.includes(profile.email)) emailInScript = true;
    }
  }

  expect(findings.map(show)).toEqual([]);
  expect(
    unknown.map((rel) => `${rel} (a file type the scan does not know)`),
  ).toEqual([]);

  // Positive controls: the scan saw the site.
  expect(scanned).toBeGreaterThanOrEqual(10);
  expect(files).toContain("index.html");
  expect(chunk, "a script under _next/static/ was scanned").toBe(true);
  expect(emailInHtmlText, "the email is in index.html's text").toBe(true);
  expect(emailInScript, "the email is in a scanned script").toBe(true);

  // Private notes never ship (D18).
  const notes = files.filter((rel) =>
    ["info.txt", "prompt.txt", "plan.txt"].includes(
      path.basename(rel).toLowerCase(),
    ),
  );
  expect(notes).toEqual([]);
});
