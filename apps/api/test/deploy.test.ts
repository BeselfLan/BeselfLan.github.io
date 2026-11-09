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
const edge = join(root, "deploy/docker-compose.edge.yml");
const read = (file: string) => readFileSync(join(root, file), "utf8");

// The files under a folder that the repository tracks or would add: a new file
// counts before it is committed, and a developer's own ignored deploy/.env does
// not.
function listed(dir: string): string[] {
  const run = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", dir],
    { cwd: root, encoding: "utf8" },
  );
  expect(run.status, run.stderr).toBe(0);
  return run.stdout.split("\n").filter((f) => f !== "");
}

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
  type?: string;
  target: string;
  source?: string;
  read_only?: boolean;
}
interface Service {
  ports?: Port[];
  volumes?: Volume[];
  networks?: Record<string, { aliases?: string[] } | null>;
  environment?: Record<string, string>;
  build?: { context: string; dockerfile: string };
}
interface Rendered {
  services: { api: Service; caddy: Service };
  networks?: Record<string, { name?: string; external?: boolean }>;
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

  it("bind the media folder next to the compose file by default", () => {
    const { api, caddy } = render().services;
    for (const service of [api, caddy]) {
      expect(volumeAt(service, "/media")).toHaveLength(1);
      expect(volumeAt(service, "/media")[0]).toMatchObject({
        type: "bind",
        source: join(root, "deploy/media"),
      });
    }
    expect(volumeAt(caddy, "/media")[0].read_only).toBe(true);
    expect(volumeAt(api, "/media")[0].read_only).not.toBe(true);
  });

  it("MEDIA_HOST_DIR moves both mounts", () => {
    const media = tempDir();
    const { api, caddy } = render({ MEDIA_HOST_DIR: media }).services;
    for (const service of [api, caddy]) {
      expect(volumeAt(service, "/media")).toHaveLength(1);
      expect(volumeAt(service, "/media")[0].source).toBe(media);
    }
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

  it("the existing-Caddy overlay starts no Caddy", () => {
    const { services } = render({ EDGE_NETWORK: "beself-test-edge" }, [
      base,
      edge,
    ]);
    expect(Object.keys(services)).toEqual(["api"]);
  });

  it("the API joins that Caddy's network as beselfos-api and publishes nothing", () => {
    const { services, networks } = render(
      { EDGE_NETWORK: "beself-test-edge" },
      [base, edge],
    );
    const { api } = services;
    expect(Object.keys(api.networks ?? {}).sort()).toEqual(["default", "edge"]);
    expect(api.networks?.edge?.aliases).toEqual(["beselfos-api"]);
    expect(api.ports).toBeUndefined();
    expect(networks?.edge).toMatchObject({
      name: "beself-test-edge",
      external: true,
    });
  });

  it("the overlay needs EDGE_NETWORK", () => {
    const envFile = join(tempDir(), "env");
    writeFileSync(
      envFile,
      Object.entries(required)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n") + "\n",
    );
    const run = compose(envFile, [base, edge]);
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("EDGE_NETWORK");
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

describe("the edge site block", () => {
  const block = read("deploy/edge/api.caddy");

  it("serves media like deploy/Caddyfile and proxies the rest", () => {
    for (const text of [
      "{$BESELFOS_API_SITE}",
      "root * /srv/beselfos/media",
      "hide .*",
      "Cross-Origin-Resource-Policy cross-origin",
      "reverse_proxy beselfos-api:8080",
    ]) {
      expect(block, text).toContain(text);
    }
  });

  it("does not compress, so Range answers stay byte-exact", () => {
    expect(block).not.toMatch(/^\s*encode\b/m);
  });
});

// `caddy adapt` reads a file and exits, so it needs no port. The image is on
// the developer's machine and not in CI, where this is skipped.
const caddyImage =
  spawnSync("docker", ["image", "inspect", "caddy:2-alpine"], {
    stdio: "ignore",
  }).status === 0;

describe.skipIf(!caddyImage)("Caddy accepts", () => {
  it.each([
    ["deploy/Caddyfile", "API_SITE"],
    ["deploy/edge/api.caddy", "BESELFOS_API_SITE"],
  ])(
    "%s",
    (file, key) => {
      const run = spawnSync(
        "docker",
        [
          "run",
          "--rm",
          "--network",
          "none",
          "-e",
          `${key}=:80`,
          "-v",
          `${join(root, file)}:/etc/caddy/Caddyfile:ro`,
          "caddy:2-alpine",
          "caddy",
          "adapt",
          "--config",
          "/etc/caddy/Caddyfile",
          "--adapter",
          "caddyfile",
        ],
        { encoding: "utf8" },
      );
      expect(run.status, run.stderr).toBe(0);
    },
    30_000,
  );
});

describe("shell scripts", () => {
  const scripts = [...listed("deploy"), ...listed("scripts/media")].filter(
    (f) => f.endsWith(".sh") && existsSync(join(root, f)),
  );

  it("are all found", () => {
    expect(scripts).toEqual(
      expect.arrayContaining([
        "deploy/smoke.sh",
        "deploy/vps-bootstrap.sh",
        "scripts/media/convert.sh",
        "scripts/media/sync.sh",
      ]),
    );
  });

  it.each(scripts)("%s parses", (file) => {
    const run = spawnSync("bash", ["-n", join(root, file)], {
      encoding: "utf8",
    });
    expect(run.status, run.stderr).toBe(0);
  });

  // The binary where there is one (CI's runner has it); else the image, which
  // sees the repo read-only and has no network; else the check is skipped.
  const image = "koalaman/shellcheck:stable";
  const runner = ((): { cmd: string; args: string[] } | null => {
    const has = (cmd: string, args: string[]) =>
      spawnSync(cmd, args, { stdio: "ignore" }).status === 0;
    if (has("shellcheck", ["--version"])) {
      return { cmd: "shellcheck", args: scripts };
    }
    if (has("docker", ["image", "inspect", image])) {
      return {
        cmd: "docker",
        args: [
          "run",
          "--rm",
          "--network",
          "none",
          "-v",
          `${root}:/mnt:ro`,
          "-w",
          "/mnt",
          image,
          ...scripts,
        ],
      };
    }
    return null;
  })();

  it.skipIf(runner === null)(
    "pass shellcheck",
    () => {
      const run = spawnSync(runner!.cmd, runner!.args, {
        cwd: root,
        encoding: "utf8",
      });
      expect(run.status, `${run.stdout}${run.stderr}`).toBe(0);
    },
    30_000,
  );
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

  // apt's package for Docker Engine, not a host.
  const allowed: Record<string, string[]> = {
    "deploy/vps-bootstrap.sh": ["docker.io"],
  };
  // Every file under deploy/ but .env.example, which has its own tests below.
  const hosted = [
    ...listed("deploy").filter((f) => f !== "deploy/.env.example"),
    "apps/api/Dockerfile",
    ...listed("scripts/media"),
  ].filter((f) => existsSync(join(root, f)));

  it("looks at every deploy file", () => {
    expect(hosted).toEqual(
      expect.arrayContaining([
        "deploy/Caddyfile",
        "deploy/edge/api.caddy",
        "deploy/smoke.sh",
        "deploy/vps-bootstrap.sh",
        "scripts/media/sync.sh",
      ]),
    );
  });

  it.each(hosted)("%s", (file) => {
    const fine = allowed[file] ?? [];
    expect(matches(file).filter((m) => !fine.includes(m))).toEqual([]);
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
      readdirSync(join(root, "deploy"))
        .filter((f) => /^docker-compose.*\.yml$/.test(f))
        .flatMap((f) => [...read(`deploy/${f}`).matchAll(/\$\{([A-Z_]+)[:}]/g)])
        .map((m) => m[1]),
    );
    expect(used.has("EDGE_NETWORK")).toBe(true);
    for (const name of used) expect(keys).toContain(name);
  });

  it("deploy/.env.example keeps COMPOSE_FILE commented out", () => {
    // An empty COMPOSE_FILE= makes Compose fail with "is a directory".
    const example = read("deploy/.env.example");
    expect(example).not.toMatch(/^COMPOSE_FILE=/m);
    expect(example).toContain(
      "# COMPOSE_FILE=docker-compose.yml:docker-compose.edge.yml",
    );
  });
});
