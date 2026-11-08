// @vitest-environment node
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// `npm run new-app` runs as a child process against a temporary copy of the
// template and the registry, so the real tree is never written.

const SCRIPT = fileURLToPath(
  new URL("../../../../../scripts/new-app.ts", import.meta.url),
);
const ROOT_PACKAGE = fileURLToPath(
  new URL("../../../../../package.json", import.meta.url),
);
const WEB = fileURLToPath(new URL("../../../", import.meta.url));

const APPS = "apps/web/src/apps";
const REGISTRY = "apps/web/src/os/apps/registry.ts";

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

/** A temp root with the real template and registry copied in. */
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "new-app-"));
  made.push(root);
  cpSync(join(WEB, "src/apps/_template"), join(root, APPS, "_template"), {
    recursive: true,
  });
  mkdirSync(join(root, "apps/web/src/os/apps"), { recursive: true });
  cpSync(join(WEB, "src/os/apps/registry.ts"), join(root, REGISTRY));
  return root;
}

function run(args: string[], root: string) {
  return spawnSync(process.execPath, [SCRIPT, ...args, "--root", root], {
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  });
}

/** Every path under `root`, directories included, mapped to its content. */
function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      const rel = path.slice(root.length + 1);
      if (statSync(path).isDirectory()) {
        out[rel + "/"] = "";
        walk(path);
      } else {
        out[rel] = readFileSync(path, "utf8");
      }
    }
  };
  walk(root);
  return out;
}

const read = (root: string, path: string) =>
  readFileSync(join(root, path), "utf8");

describe("npm run new-app", { timeout: 20_000 }, () => {
  it("creates the app folder", () => {
    const root = fixture();
    const templateBefore = snapshot(join(root, APPS, "_template"));
    const result = run(["terminal"], root);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);

    expect(readdirSync(join(root, APPS, "terminal")).sort()).toEqual([
      "TerminalApp.tsx",
      "index.ts",
    ]);
    const index = read(root, `${APPS}/terminal/index.ts`);
    const component = read(root, `${APPS}/terminal/TerminalApp.tsx`);
    expect(index).toContain('const ID = "terminal";');
    expect(index).toContain('name: "Terminal",');
    expect(index).toContain('import("./TerminalApp")');
    expect(index).toContain("TerminalArgs");
    expect(component).toContain("export default function TerminalApp(");
    expect(component).toContain('import type { TerminalArgs } from "./index";');
    for (const text of [index, component]) {
      for (const left of [
        '"hello"',
        '"Hello"',
        "TemplateApp",
        "TemplateArgs",
      ]) {
        expect(text).not.toContain(left);
      }
    }
    // Free text is not touched: a blanket replace of Hello would fail here.
    expect(component).toContain('`Hello, ${args.name ?? "world"}`');
    expect(component).toContain('"Hello from Hello"');
    // The template is only read.
    expect(snapshot(join(root, APPS, "_template"))).toEqual(templateBefore);
    // It says what it made.
    expect(result.stdout).toContain(`created ${APPS}/terminal/index.ts`);
    expect(result.stdout).toContain(`updated ${REGISTRY}`);
    expect(result.stdout).toContain("docs/APPS.md");
  });

  it("registers it", () => {
    const root = fixture();
    const before = read(root, REGISTRY);
    expect(run(["terminal"], root).status).toBe(0);
    const after = read(root, REGISTRY);

    const lines = after.split("\n");
    const imports = lines.indexOf("// new-app: imports");
    const entries = lines.indexOf("  // new-app: entries");
    expect(lines[imports - 1]).toBe('import terminal from "@/apps/terminal";');
    expect(lines[entries - 1]).toBe("  terminal,");
    // Nothing else changed: take those two lines out and the file is back,
    // byte for byte. Appending, inserting below a marker or reformatting fails.
    lines.splice(entries - 1, 1);
    lines.splice(imports - 1, 1);
    expect(lines.join("\n")).toBe(before);
  });

  it.each([
    ["music-player", "musicPlayer", "MusicPlayer", "Music Player"],
    ["x-ray", "xRay", "XRay", "X Ray"],
    ["a-1", "a1", "A1", "A 1"],
  ])("multi-word ids: %s", (id, camel, pascal, title) => {
    const root = fixture();
    expect(run([id], root).status).toBe(0);
    const index = read(root, `${APPS}/${id}/index.ts`);
    const component = read(root, `${APPS}/${id}/${pascal}App.tsx`);
    expect(index).toContain(`const ID = "${id}";`);
    expect(index).toContain(`name: "${title}",`);
    expect(index).toContain(`${pascal}Args`);
    expect(component).toContain(`export default function ${pascal}App(`);
    const registry = read(root, REGISTRY);
    expect(registry).toContain(`import ${camel} from "@/apps/${id}";\n`);
    expect(registry).toContain(`\n  ${camel},\n`);
  });

  const noEntriesMarker = (root: string) => {
    const path = join(root, REGISTRY);
    writeFileSync(
      path,
      readFileSync(path, "utf8").replace("  // new-app: entries\n", ""),
    );
  };
  const noImportsMarker = (root: string) => {
    const path = join(root, REGISTRY);
    writeFileSync(
      path,
      readFileSync(path, "utf8").replace("// new-app: imports\n", ""),
    );
  };
  const markersSwapped = (root: string) => {
    const path = join(root, REGISTRY);
    writeFileSync(
      path,
      readFileSync(path, "utf8")
        .replace("// new-app: imports", "// TMP")
        .replace("  // new-app: entries", "// new-app: imports")
        .replace("// TMP", "  // new-app: entries"),
    );
  };
  const appendToTemplate = (text: string) => (root: string) => {
    const path = join(root, APPS, "_template/index.ts");
    writeFileSync(path, readFileSync(path, "utf8") + text);
  };

  it.each<[string, string[], ((root: string) => void)?]>([
    ["an id that is already registered", ["projects"]],
    ["an id that is not kebab-case", ["Music_Player"]],
    ["a leading digit", ["3d"]],
    ["a double dash", ["a--b"]],
    ["no id", []],
    ["two ids", ["a", "b"]],
    ["the template's own id", ["hello"]],
    ["a name the registry already uses", ["apps"]],
    ["a name the registry imports", ["get-app"]],
    ["a reserved word", ["class"]],
    ["a contextual word", ["type"]],
    ["an unknown flag", ["terminal", "--force"]],
    [
      "a folder that exists",
      ["terminal"],
      (root) => mkdirSync(join(root, APPS, "terminal")),
    ],
    ["a registry without the entries marker", ["terminal"], noEntriesMarker],
    ["a registry without the imports marker", ["terminal"], noImportsMarker],
    ["markers in the wrong order", ["terminal"], markersSwapped],
    [
      "a template that holds the id twice",
      ["terminal"],
      appendToTemplate('\nconst ID = "hello";\n'),
    ],
    [
      "a template that holds the name twice",
      ["terminal"],
      appendToTemplate('\nconst other = { name: "Hello", };\n'),
    ],
    [
      "a template with a stray quoted literal",
      ["terminal"],
      appendToTemplate('\n// "hello"\n'),
    ],
    // Its copy would still hold a Template name, so it could pass for the
    // template.
    ["an id that starts with template", ["template-two"]],
    ["the id template", ["template"]],
  ])("refuses bad input: %s", (_, args, setup) => {
    const root = fixture();
    setup?.(root);
    const before = snapshot(root);
    const result = run(args, root);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("new-app:");
    expect(result.stdout).toBe("");
    // Nothing is written, not even an empty folder.
    expect(snapshot(root)).toEqual(before);
  });

  it("the usage line names the command", () => {
    const result = run([], fixture());
    expect(result.stderr).toContain("npm run new-app <id>");
  });

  it("a second run refuses", () => {
    const root = fixture();
    expect(run(["terminal"], root).status).toBe(0);
    const once = snapshot(root);
    const second = run(["terminal"], root);
    expect(second.status).not.toBe(0);
    expect(second.stderr).toContain("new-app:");
    expect(snapshot(root)).toEqual(once);
    expect(read(root, REGISTRY).split("  terminal,\n")).toHaveLength(2);
  });

  it("two different apps both register, each above the markers", () => {
    const root = fixture();
    expect(run(["terminal"], root).status).toBe(0);
    expect(run(["music-player"], root).status).toBe(0);
    const lines = read(root, REGISTRY).split("\n");
    const entries = lines.indexOf("  // new-app: entries");
    expect(lines.slice(entries - 3, entries + 2)).toEqual([
      "  hello,",
      "  terminal,",
      "  musicPlayer,",
      "  // new-app: entries",
      "];",
    ]);
  });

  it("removes the folder when a write fails", () => {
    // A template directory named like the renamed component: the file is
    // written first, then making the directory fails.
    const root = fixture();
    const clash = join(root, APPS, "_template/TerminalApp.tsx");
    mkdirSync(clash);
    writeFileSync(join(clash, "inner.txt"), "x");
    const registryBefore = read(root, REGISTRY);
    const result = run(["terminal"], root);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("new-app:");
    expect(() => statSync(join(root, APPS, "terminal"))).toThrow();
    expect(read(root, REGISTRY)).toBe(registryBefore);
  });

  it("the npm script exists", () => {
    const pkg = JSON.parse(readFileSync(ROOT_PACKAGE, "utf8")) as {
      type?: string;
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["new-app"]).toBe("node scripts/new-app.ts");
    // So Node does not guess the module type of scripts/new-app.ts.
    expect(pkg.type).toBe("module");
  });

  it("the template keeps the id and the name on their own lines", () => {
    // The script rewrites exactly these two lines. A later template edit that
    // repeats either literal, or moves them, fails here first.
    const dir = join(WEB, "src/apps/_template");
    const text = readdirSync(dir)
      .sort()
      .map((name) => readFileSync(join(dir, name), "utf8"))
      .join("\n");
    const count = (needle: string) => text.split(needle).length - 1;
    expect(count('"hello"')).toBe(1);
    expect(count('const ID = "hello";')).toBe(1);
    expect(count('"Hello"')).toBe(1);
    expect(count('name: "Hello",')).toBe(1);
  });
});
