import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");
const base = join(root, "deploy/docker-compose.yml");
const local = join(root, "deploy/docker-compose.local.yml");
const read = (file: string) => readFileSync(join(root, file), "utf8");

// `docker compose config` only reads files, so it needs no daemon.
const composeAvailable =
  spawnSync("docker", ["compose", "version"], { stdio: "ignore" }).status === 0;

interface Port {
  target: number;
  published?: string;
  host_ip?: string;
  protocol: string;
}
interface Volume {
  target: string;
  source?: string;
  read_only?: boolean;
}
interface Service {
  ports?: Port[];
  volumes?: Volume[];
  environment?: Record<string, string>;
  build?: { context: string; dockerfile: string };
}
interface Rendered {
  services: { api: Service; caddy: Service };
}

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "deploy-test-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

const required = {
  API_SITE: ":80",
  HTTP_PORT: "18999",
  PUBLIC_MEDIA_BASE_URL: "http://127.0.0.1:18999/media/files",
  CORS_ORIGINS: "http://localhost:3000",
};

// Only PATH and HOME: Compose lets shell variables override --env-file, so a
// developer's own API_SITE must not leak into these tests.
function compose(envFile: string, files: string[]) {
  return spawnSync(
    "docker",
    [
      "compose",
      "-p",
      "beself-12-config",
      "--env-file",
      envFile,
      ...files.flatMap((f) => ["-f", f]),
      "config",
      "--format",
      "json",
    ],
    {
      encoding: "utf8",
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
    },
  );
}

function render(
  env: Record<string, string> = {},
  files: string[] = [base],
): Rendered {
  const envFile = join(tempDir(), "env");
  writeFileSync(
    envFile,
    Object.entries({ ...required, ...env })
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n",
  );
  const run = compose(envFile, files);
  expect(run.status, run.stderr).toBe(0);
  return JSON.parse(run.stdout) as Rendered;
}

const volumeAt = (service: Service, target: string) =>
  (service.volumes ?? []).filter((v) => v.target === target);

describe.skipIf(!composeAvailable)("Compose files", () => {
  it.each([
    ["the base file", [base]],
    ["the base file and the local override", [base, local]],
  ])("never publish the API port: %s", (_name, files) => {
    expect(
      render({ MEDIA_HOST_DIR: tempDir() }, files).services.api.ports,
    ).toBeUndefined();
  });

  it("publish Caddy on one loopback port locally", () => {
    const { ports } = render({ MEDIA_HOST_DIR: tempDir() }, [base, local])
      .services.caddy;
    expect(ports).toHaveLength(1);
    expect(ports?.[0]).toMatchObject({
      host_ip: "127.0.0.1",
      published: "18999",
      target: 80,
    });
  });

  it("publish 80 and 443 on the base file alone", () => {
    const ports = render().services.caddy.ports ?? [];
    expect(ports.map((p) => `${p.target}/${p.protocol}`).sort()).toEqual([
      "443/tcp",
      "443/udp",
      "80/tcp",
    ]);
  });

  it("stop on a missing required value", () => {
    // Copied as committed: every required key is empty.
    const envFile = join(tempDir(), "env");
    writeFileSync(envFile, read("deploy/.env.example"));
    const run = compose(envFile, [base]);
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/API_SITE|PUBLIC_MEDIA_BASE_URL/);
  });

  it.each(["API_SITE", "PUBLIC_MEDIA_BASE_URL", "CORS_ORIGINS"])(
    "stop without %s",
    (key) => {
      const env: Record<string, string> = { ...required };
      delete env[key];
      const envFile = join(tempDir(), "env");
      writeFileSync(
        envFile,
        Object.entries(env)
          .map(([k, v]) => `${k}=${v}`)
          .join("\n") + "\n",
      );
      const run = compose(envFile, [base]);
      expect(run.status).not.toBe(0);
      expect(run.stderr).toContain(key);
    },
  );

  it("give keys to the API only", () => {
    const { api, caddy } = render({
      RESEND_API_KEY: "key-marker-test",
    }).services;
    expect(api.environment?.RESEND_API_KEY).toBe("key-marker-test");
    expect(JSON.stringify(caddy)).not.toContain("key-marker-test");
    expect(Object.keys(caddy.environment ?? {})).toEqual(["API_SITE"]);
    expect(Object.keys(api.environment ?? {}).sort()).toEqual([
      "ADMIN_TOKEN",
      "CONTACT_FROM",
      "CONTACT_TO",
      "CORS_ORIGINS",
      "DMOJ_USER",
      "GITHUB_USER",
      "PUBLIC_MEDIA_BASE_URL",
      "RESEND_API_KEY",
    ]);
  });

  it("let Caddy read media read-only", () => {
    const { caddy } = render().services;
    expect(volumeAt(caddy, "/media")).toHaveLength(1);
    expect(volumeAt(caddy, "/media")[0].read_only).toBe(true);
  });

  it("mount the chosen media folder once, locally", () => {
    const media = tempDir();
    const { api, caddy } = render({ MEDIA_HOST_DIR: media }, [
      base,
      local,
    ]).services;
    for (const service of [api, caddy]) {
      expect(volumeAt(service, "/media")).toHaveLength(1);
      expect(volumeAt(service, "/media")[0].source).toBe(media);
    }
  });

  it("build the API from the repo root, locally", () => {
    const { api } = render({ MEDIA_HOST_DIR: tempDir() }, [
      base,
      local,
    ]).services;
    expect(api.build).toEqual({
      context: root,
      dockerfile: "apps/api/Dockerfile",
    });
  });
});

describe("the Caddyfile", () => {
  const caddyfile = read("deploy/Caddyfile");

  it("does not compress, so Range answers stay byte-exact", () => {
    expect(caddyfile).not.toMatch(/^\s*encode\b/m);
  });

  it("hides dotfiles and takes its site from env", () => {
    expect(caddyfile).toMatch(/hide \.\*/);
    expect(caddyfile).toContain("{$API_SITE}");
  });
});

describe("the API image", () => {
  // Continued lines joined, comments and blanks dropped.
  const lines = read("apps/api/Dockerfile")
    .replace(/\\\n/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"));
  const froms = lines.flatMap((l, i) => (l.startsWith("FROM ") ? [i] : []));
  const last = lines.slice(froms[froms.length - 1]);

  it("is multi-stage, runs as non-root, and reports healthy through HEALTHCHECK", () => {
    expect(froms.length).toBeGreaterThanOrEqual(2);
    expect(last.some((l) => /^ENV .*NODE_ENV=production/.test(l))).toBe(true);
    expect(last).toContain("USER node");
    expect(last.some((l) => l.startsWith("HEALTHCHECK "))).toBe(true);
  });

  it("installs no dev dependencies in the last stage", () => {
    const installs = last.filter((l) => l.includes("npm ci"));
    expect(installs.length).toBeGreaterThan(0);
    for (const install of installs) expect(install).toContain("--omit=dev");
  });

  it("installs only the API workspace", () => {
    for (const l of lines.filter((l) => l.includes("npm ci"))) {
      expect(l).toContain("--workspace api");
    }
  });

  it("copies only an allowlist out of the repo root", () => {
    const ignore = read("apps/api/Dockerfile.dockerignore")
      .split("\n")
      .filter((l) => l.trim() !== "" && !l.startsWith("#"));
    expect(ignore[0]).toBe("*");
    expect(ignore.slice(1).sort()).toEqual(
      [
        "!apps/api/package.json",
        "!apps/api/src",
        "!apps/api/tsconfig.build.json",
        "!apps/api/tsconfig.json",
        "!apps/web/package.json",
        "!package-lock.json",
        "!package.json",
        "!packages/content/package.json",
        "!packages/content/src/schema.ts",
      ].sort(),
    );
  });
});

describe("no domain is hard-coded", () => {
  const domain =
    /\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|io|dev|app|ca|co|me|xyz|cloud|site)\b/gi;
  const matches = (file: string) => read(file).match(domain) ?? [];

  const hosted = [
    "deploy/docker-compose.yml",
    "deploy/docker-compose.local.yml",
    "deploy/Caddyfile",
    "apps/api/Dockerfile",
    "deploy/smoke.sh",
    ...readdirSync(join(root, "scripts/media")).map(
      (f) => `scripts/media/${f}`,
    ),
  ].filter((f) => existsSync(join(root, f)));

  it.each(hosted)("%s", (file) => {
    expect(matches(file)).toEqual([]);
  });

  it("deploy/.env.example names only example hosts", () => {
    const found = matches("deploy/.env.example");
    expect(found.length).toBeGreaterThan(0);
    for (const host of found) {
      expect(host).toMatch(
        /^(([a-z0-9-]+\.)*example\.com|beselflan\.github\.io|ghcr\.io)$/i,
      );
    }
  });

  it("deploy/.env.example has no address except loopback", () => {
    const addresses = read("deploy/.env.example").match(/\b\d+(\.\d+){3}\b/g);
    expect((addresses ?? []).filter((a) => a !== "127.0.0.1")).toEqual([]);
  });

  it("deploy/.env.example documents every variable the stack reads", () => {
    const keys = [...read("deploy/.env.example").matchAll(/^([A-Z_]+)=/gm)].map(
      (m) => m[1],
    );
    const used = new Set(
      [
        ...read("deploy/docker-compose.yml").matchAll(/\$\{([A-Z_]+)[:}]/g),
        ...read("deploy/docker-compose.local.yml").matchAll(
          /\$\{([A-Z_]+)[:}]/g,
        ),
      ].map((m) => m[1]),
    );
    for (const name of used) expect(keys).toContain(name);
  });
});
