import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");
const base = join(root, "deploy/docker-compose.yml");
const local = join(root, "deploy/docker-compose.local.yml");
const edge = join(root, "deploy/docker-compose.edge.yml");
const web = join(root, "deploy/docker-compose.web.yml");
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

// A host name: a dotted name that ends in a common top-level domain. The g flag
// is for String.prototype.match, so never use it with test().
const domain =
  /\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|io|dev|app|ca|co|me|xyz|cloud|site)\b/gi;

// Every KEY= line of deploy/.env.example. COMPOSE_FILE is commented out there,
// so it is not one of them.
const envKeys = [...read("deploy/.env.example").matchAll(/^([A-Z_]+)=/gm)].map(
  (m) => m[1],
);

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
  profiles?: string[];
  depends_on?: Record<string, { condition: string }>;
  build?: {
    context: string;
    dockerfile: string;
    args?: Record<string, string>;
  };
}
interface Rendered {
  services: { api: Service; caddy: Service; web: Service };
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
// developer's own API_SITE must not leak into these tests. With no files and a
// `cwd`, Compose picks its files itself, as it does on the VPS.
function compose(envFile: string, files: string[], cwd?: string) {
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
      cwd,
      encoding: "utf8",
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
    },
  );
}

function render(
  env: Record<string, string> = {},
  files: string[] = [base],
  cwd?: string,
): Rendered {
  const envFile = join(tempDir(), "env");
  writeFileSync(
    envFile,
    Object.entries({ ...required, ...env })
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n",
  );
  const run = compose(envFile, files, cwd);
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

  // Topology (b): the site on this host too.
  const siteEnv = { WEB_SITE: "http://web.localhost" };

  it("the topology is selected by env", () => {
    // From deploy/ with no -f, as on the VPS, where Compose reads COMPOSE_FILE
    // from /srv/beselfos/.env itself.
    const cwd = join(root, "deploy");
    const names = (r: Rendered) => Object.keys(r.services).sort();
    const on = render(
      {
        ...siteEnv,
        COMPOSE_FILE: "docker-compose.yml:docker-compose.web.yml",
      },
      [],
      cwd,
    );
    expect(names(on)).toEqual(["api", "caddy", "web"]);
    // The same values without that line: (a), where the site is on Pages.
    expect(names(render(siteEnv, [], cwd))).toEqual(["api", "caddy"]);
  });

  it("(b) gives Caddy the site and nothing else", () => {
    const { caddy, web: site } = render(
      {
        ...siteEnv,
        NEXT_PUBLIC_API_URL: "http://127.0.0.1:18999",
        MEDIA_HOST_DIR: tempDir(),
        RESEND_API_KEY: "resend-marker-139",
      },
      [base, web, local],
    ).services;
    expect(Object.keys(caddy.environment ?? {}).sort()).toEqual([
      "API_SITE",
      "WEB_SITE",
    ]);
    expect(volumeAt(caddy, "/etc/caddy/sites/web.caddy")).toHaveLength(1);
    expect(volumeAt(caddy, "/etc/caddy/sites/web.caddy")[0]).toMatchObject({
      read_only: true,
      source: join(root, "deploy/web/site.caddy"),
    });
    expect(caddy.depends_on?.web?.condition).toBe("service_healthy");
    // The API's secrets reach neither Caddy nor the site.
    expect(JSON.stringify(caddy)).not.toContain("resend-marker-139");
    expect(JSON.stringify(site)).not.toContain("resend-marker-139");
    // The API origin is baked in at build time, so the site runs with none.
    expect(site.environment).toBeUndefined();
    expect(site.ports).toBeUndefined();
    expect(site.build?.args?.NEXT_PUBLIC_API_URL).toBe(
      "http://127.0.0.1:18999",
    );
  });

  it("(b) needs WEB_SITE", () => {
    const envFile = join(tempDir(), "env");
    writeFileSync(
      envFile,
      Object.entries(required)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n") + "\n",
    );
    const run = compose(envFile, [base, web]);
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("WEB_SITE");
  });

  it("the host's Caddy with (b) gets the API and the site, and publishes nothing", () => {
    const { services } = render(
      { ...siteEnv, EDGE_NETWORK: "beself-test-edge" },
      [base, web, edge],
    );
    expect(Object.keys(services).sort()).toEqual(["api", "web"]);
    expect(services.web.networks?.edge?.aliases).toEqual(["beselfos-web"]);
    expect(services.api.ports).toBeUndefined();
    expect(services.web.ports).toBeUndefined();
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
  // Each row is a file and the KEY=value pairs its placeholders need.
  it.each<[string, string[]]>([
    ["deploy/Caddyfile", ["API_SITE=:80"]],
    ["deploy/edge/api.caddy", ["BESELFOS_API_SITE=:80"]],
    ["deploy/web/Caddyfile", ["API_ORIGIN=http://127.0.0.1:18999"]],
    ["deploy/web/site.caddy", ["WEB_SITE=:80"]],
    ["deploy/edge/web.caddy", ["BESELFOS_WEB_SITE=:80"]],
  ])(
    "%s",
    (file, env) => {
      const run = spawnSync(
        "docker",
        [
          "run",
          "--rm",
          "--network",
          "none",
          ...env.flatMap((pair) => ["-e", pair]),
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

  it("deploy/Caddyfile with the site block imported", () => {
    // The mount Compose adds in topology (b), where the import finds it.
    const run = spawnSync(
      "docker",
      [
        "run",
        "--rm",
        "--network",
        "none",
        "-e",
        "API_SITE=:80",
        "-e",
        "WEB_SITE=http://web.localhost",
        "-v",
        `${join(root, "deploy/Caddyfile")}:/etc/caddy/Caddyfile:ro`,
        "-v",
        `${join(root, "deploy/web/site.caddy")}:/etc/caddy/sites/web.caddy:ro`,
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
    // Both blocks are in the result, and the import found its file.
    expect(run.stdout).toContain("api:8080");
    expect(run.stdout).toContain("web:8080");
    expect(run.stderr).not.toContain("No files matching");
  }, 30_000);
});

describe("shell scripts", () => {
  const scripts = [...listed("deploy"), ...listed("scripts/media")].filter(
    (f) => f.endsWith(".sh") && existsSync(join(root, f)),
  );

  it("are all found", () => {
    expect(scripts).toEqual(
      expect.arrayContaining([
        "deploy/bootstrap-check.sh",
        "deploy/smoke-web.sh",
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

// The checks run on a host that other projects share. They start containers
// only under their own Compose project, and every one-off container has no
// network and no ports, so none of them can reach or disturb anything else.
describe("the local checks stay inside their own project", () => {
  const scripts = [
    "deploy/smoke.sh",
    "deploy/smoke-web.sh",
    "deploy/bootstrap-check.sh",
  ];
  const code = (file: string) =>
    read(file)
      .split("\n")
      .filter((l) => !l.trim().startsWith("#"));

  it.each(scripts)(
    "%s: every docker run has no network and no ports",
    (file) => {
      const runs = code(file).filter((l) => l.includes("docker run"));
      expect(runs.length).toBeGreaterThan(0);
      for (const line of runs) {
        expect(line).toContain("--rm");
        expect(line).toContain("--network none");
        expect(line).not.toMatch(/ -p |--publish/);
      }
    },
  );

  it.each(scripts)(
    "%s: removes and prunes nothing it did not start",
    (file) => {
      const text = read(file);
      expect(text).not.toMatch(/\bprune\b|--rmi\b/);
      expect(text).not.toMatch(/\bdocker\s+(stop|kill|rm|rmi|restart)\b/);
      expect(text).not.toMatch(
        /\bdocker\s+network\s+(create|rm|connect|disconnect)\b/,
      );
      // The edge overlay needs the host's real network: config only, in tests.
      expect(text).not.toContain("docker-compose.edge.yml");
    },
  );

  it.each(["deploy/smoke.sh", "deploy/smoke-web.sh"])(
    "%s: Compose runs only under the project's own name, with the local override",
    (file) => {
      const runs = code(file).filter((l) => l.includes("docker compose"));
      expect(runs).toHaveLength(1);
      expect(runs[0]).toContain('docker compose -p "$project"');
      expect(read(file)).toContain("docker-compose.local.yml");
    },
  );

  // Compose lets a shell variable override --env-file, so a check clears the
  // names its stack reads before it writes its own env file.
  const cleared = (file: string): string[] => {
    const unset = code(file)
      .join("\n")
      .replace(/\\\n/g, " ")
      .match(/^unset (.*)$/m);
    expect(unset, `${file} has an unset line`).not.toBeNull();
    return unset![1].split(/\s+/);
  };
  const exampleKeys = [
    ...read("deploy/.env.example").matchAll(/^([A-Z_]+)=/gm),
  ].map((m) => m[1]);

  it("deploy/smoke-web.sh clears every key of .env.example and the Compose variables", () => {
    const unset = cleared("deploy/smoke-web.sh");
    for (const name of [
      ...exampleKeys,
      "COMPOSE_FILE",
      "COMPOSE_PROFILES",
      "COMPOSE_PROJECT_NAME",
    ]) {
      expect(unset, name).toContain(name);
    }
  });

  it("deploy/smoke.sh clears what the API stack reads, and the Compose variables", () => {
    const unset = cleared("deploy/smoke.sh");
    // It runs (a): no site, no host Caddy, and no rsync target.
    const own = exampleKeys.filter(
      (k) =>
        !["WEB_SITE", "WEB_IMAGE", "NEXT_PUBLIC_API_URL"].includes(k) &&
        !["EDGE_NETWORK", "MEDIA_SYNC_TARGET"].includes(k),
    );
    for (const name of [...own, "COMPOSE_FILE", "COMPOSE_PROFILES"]) {
      expect(unset, name).toContain(name);
    }
  });

  it.each(["deploy/smoke.sh", "deploy/smoke-web.sh"])(
    "%s: refuses a port below 1024 before it does anything",
    (file) => {
      for (const port of ["80", "443", "1023", "70000", "abc"]) {
        const run = spawnSync("bash", [join(root, file)], {
          encoding: "utf8",
          env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            SMOKE_PORT: port,
          },
        });
        expect(run.status, port).toBe(1);
        expect(run.stderr, port).toContain("SMOKE_PORT");
      }
    },
  );

  it("smoke-web.sh is executable", () => {
    expect(statSync(join(root, "deploy/smoke-web.sh")).mode & 0o111).not.toBe(
      0,
    );
  });
});

describe("the site image", () => {
  // Continued lines joined, comments and blanks dropped.
  const lines = read("deploy/web/Dockerfile")
    .replace(/\\\n/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"));
  const froms = lines.flatMap((l, i) => (l.startsWith("FROM ") ? [i] : []));
  const build = lines.slice(froms[0], froms[1]);
  const last = lines.slice(froms[froms.length - 1]);

  it("serves the export from caddy:2-alpine, as a user that is not root", () => {
    expect(froms).toHaveLength(2);
    expect(last[0]).toBe("FROM caddy:2-alpine");
    const users = last.filter((l) => l.startsWith("USER "));
    expect(users).toHaveLength(1);
    expect(users[0]).not.toMatch(/^USER (root|0)\b/);
    expect(last.some((l) => l.startsWith("HEALTHCHECK "))).toBe(true);
    expect(last).toContain("EXPOSE 8080");
    expect(last.some((l) => l.startsWith("ENV API_ORIGIN="))).toBe(true);
    // Only Caddy and the export: no Node in the image that is run.
    expect(last.join("\n")).not.toContain("npm");
  });

  it("installs only the web workspace, and takes the API origin after the install", () => {
    const install = build.findIndex((l) => l.includes("npm ci"));
    expect(install).toBeGreaterThan(-1);
    expect(build[install]).toContain("npm ci --workspace web");
    const arg = build.findIndex((l) => l.startsWith("ARG NEXT_PUBLIC_API_URL"));
    // Above the install, every change of origin would run the install again.
    expect(arg).toBeGreaterThan(install);
  });

  it("copies only an allowlist out of the repo root", () => {
    const ignore = read("deploy/web/Dockerfile.dockerignore")
      .split("\n")
      .filter((l) => l.trim() !== "" && !l.startsWith("#"));
    expect(ignore).toEqual([
      "*",
      "!package.json",
      "!package-lock.json",
      "!apps/api/package.json",
      "!apps/web/package.json",
      "!apps/web/next.config.ts",
      "!apps/web/tsconfig.json",
      "!apps/web/src",
      "!apps/web/public",
      "!packages/content/package.json",
      "!packages/content/src",
      "!deploy/web/Caddyfile",
      "apps/web/src/**/*.test.*",
      "packages/content/src/**/*.test.*",
    ]);
    // Never the whole of a folder that holds private or unneeded files.
    for (const line of ignore) {
      expect(line).not.toMatch(/^!(\.|docs|apps\/web$|media-src)/);
    }
  });
});

describe("the site's headers", () => {
  // Comment lines hold words like 'unsafe-eval' on purpose.
  const caddyfile = read("deploy/web/Caddyfile")
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");

  it("sets seven security headers on every response", () => {
    for (const name of [
      "Content-Security-Policy",
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Cross-Origin-Opener-Policy",
    ]) {
      expect(caddyfile, name).toMatch(new RegExp(`^\\s+${name} "`, "m"));
    }
  });

  it("lets the page reach its own origin and the API origin, and nothing else", () => {
    for (const text of [
      "connect-src 'self' {$API_ORIGIN}",
      "media-src 'self' {$API_ORIGIN}",
      "img-src 'self' data: {$API_ORIGIN}",
      "frame-ancestors 'none'",
      "object-src 'none'",
    ]) {
      expect(caddyfile, text).toContain(text);
    }
    expect(caddyfile).not.toContain("unsafe-eval");
  });

  it("answers a missing page with 404.html, and caches only hashed names for good", () => {
    expect(caddyfile).toContain("handle_errors 404");
    expect(caddyfile).toContain("public, max-age=31536000, immutable");
    expect(caddyfile).toContain('"no-cache"');
  });
});

describe("no domain is hard-coded", () => {
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
        "deploy/smoke-browser.mts",
        "deploy/smoke.sh",
        "deploy/vps-bootstrap.sh",
        "deploy/web/Caddyfile",
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
    const used = new Set(
      readdirSync(join(root, "deploy"))
        .filter((f) => /^docker-compose.*\.yml$/.test(f))
        .flatMap((f) => [...read(`deploy/${f}`).matchAll(/\$\{([A-Z_]+)[:}]/g)])
        .map((m) => m[1]),
    );
    expect(used.has("EDGE_NETWORK")).toBe(true);
    for (const name of used) expect(envKeys).toContain(name);
  });

  it("deploy/.env.example keeps COMPOSE_FILE commented out", () => {
    // An empty COMPOSE_FILE= makes Compose fail with "is a directory".
    const example = read("deploy/.env.example");
    expect(example).not.toMatch(/^COMPOSE_FILE=/m);
    expect(example).toContain(
      "# COMPOSE_FILE=docker-compose.yml:docker-compose.edge.yml",
    );
    expect(example).toContain(
      "# COMPOSE_FILE=docker-compose.yml:docker-compose.web.yml",
    );
  });
});
