// npm run new-app <id>
//
// Copies apps/web/src/apps/_template (the Hello app) to apps/web/src/apps/<id>
// and registers the new app in apps/web/src/os/apps/registry.ts. docs/APPS.md
// has the steps to take afterwards.
//
// Node 24 runs this file by stripping its types, so only erasable TypeScript
// is used here: no enum, no namespace, no parameter properties. It imports
// only node: modules, and `--root <dir>` moves every path, for the tests.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export interface Io {
  out(line: string): void;
  err(line: string): void;
}

export interface Names {
  /** music-player */
  id: string;
  /** musicPlayer: the registry's import name. */
  camel: string;
  /** MusicPlayer: the prefix of the component and the args type. */
  pascal: string;
  /** Music Player: the app's name. */
  title: string;
}

const USAGE = "usage: npm run new-app <id>   (kebab-case, e.g. music-player)";

// The same rule as registry.test.ts (plan 3.4).
const ID_RULE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

const TEMPLATE_DIR = "apps/web/src/apps/_template";
const APPS_DIR = "apps/web/src/apps";
const REGISTRY = "apps/web/src/os/apps/registry.ts";
const IMPORTS_MARKER = "// new-app: imports";
const ENTRIES_MARKER = "// new-app: entries";

// An import name that is a keyword would not compile. The JS reserved and
// strict-mode words, plus words that are special in some position.
const RESERVED = new Set(
  (
    "break case catch class const continue debugger default delete do else enum " +
    "export extends false finally for function if import in instanceof new null " +
    "return super switch this throw true try typeof var void while with yield " +
    "let static implements interface package private protected public await " +
    "type as from of async get set undefined arguments eval"
  ).split(" "),
);

/** Strings and comments, which hold no identifiers of the registry. */
const STRINGS_AND_COMMENTS =
  /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;

class Refusal extends Error {}

function refuse(reason: string): never {
  throw new Refusal(reason);
}

/** music-player gives musicPlayer, MusicPlayer and "Music Player". */
export function namesFor(id: string): Names {
  const words = id.split("-");
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
  const pascal = words.map(cap).join("");
  return {
    id,
    camel: pascal.charAt(0).toLowerCase() + pascal.slice(1),
    pascal,
    title: words.map(cap).join(" "),
  };
}

/** Every file below `dir`, as paths relative to it, in sorted order. */
function listFiles(dir: string, base = ""): string[] {
  const found: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const entry of entries) {
    const rel = base === "" ? entry.name : `${base}/${entry.name}`;
    if (entry.isDirectory())
      found.push(...listFiles(join(dir, entry.name), rel));
    else if (entry.isFile()) found.push(rel);
  }
  return found;
}

/** The text of `file` with its one `from` replaced by `to`, or a refusal. */
function replaceOnce(text: string, from: string, to: string, file: string) {
  const parts = text.split(from);
  if (parts.length !== 2) {
    refuse(`the template changed: ${file} must hold exactly one ${from}`);
  }
  return parts[0] + to + parts[1];
}

interface Plan {
  folder: string;
  files: Map<string, string>;
  registry: string;
  registryText: string;
}

/** Reads and checks everything, and writes nothing. Throws a Refusal. */
function plan(root: string, names: Names): Plan {
  const { id, camel, pascal, title } = names;
  if (RESERVED.has(camel))
    refuse(`"${camel}" is a reserved word, pick another id`);

  const templateDir = join(root, TEMPLATE_DIR);
  for (const name of ["index.ts", "TemplateApp.tsx"]) {
    if (!existsSync(join(templateDir, name))) {
      refuse(`the template changed: ${TEMPLATE_DIR}/${name} is missing`);
    }
  }

  // The registry: both markers once, the imports one first.
  const registry = join(root, REGISTRY);
  if (!existsSync(registry)) refuse(`${REGISTRY} does not exist`);
  const registryText = readFileSync(registry, "utf8");
  const lines = registryText.split("\n");
  const at = (marker: string) =>
    lines.flatMap((l, i) => (l.trim() === marker ? [i] : []));
  const imports = at(IMPORTS_MARKER);
  const entries = at(ENTRIES_MARKER);
  if (imports.length !== 1 || entries.length !== 1) {
    refuse(
      `${REGISTRY} must hold exactly one "${IMPORTS_MARKER}" line and one "${ENTRIES_MARKER}" line`,
    );
  }
  if (imports[0] > entries[0]) {
    refuse(
      `in ${REGISTRY}, "${IMPORTS_MARKER}" must come before "${ENTRIES_MARKER}"`,
    );
  }

  // Nothing of this id exists yet.
  const folder = join(root, APPS_DIR, id);
  if (existsSync(folder)) refuse(`${APPS_DIR}/${id} already exists`);
  if (registryText.includes(`"@/apps/${id}"`)) {
    refuse(`${REGISTRY} already imports @/apps/${id}`);
  }
  const code = registryText.replace(STRINGS_AND_COMMENTS, "");
  if (new RegExp(`\\b${camel}\\b`).test(code)) {
    refuse(`"${camel}" is already a name in ${REGISTRY}, pick another id`);
  }
  const appsDir = join(root, APPS_DIR);
  for (const entry of readdirSync(appsDir, { withFileTypes: true })) {
    const index = join(appsDir, entry.name, "index.ts");
    if (!entry.isDirectory() || !existsSync(index)) continue;
    const text = readFileSync(index, "utf8");
    if (text.includes(`id: "${id}"`) || text.includes(`const ID = "${id}"`)) {
      refuse(`the app id "${id}" is already used by ${APPS_DIR}/${entry.name}`);
    }
  }

  // The copy, built in memory. Identifiers that start with Template follow the
  // app's name. In index.ts only the id line and the name line change, and
  // each must be there once, so a template that drifted fails loudly.
  const prefix = /\bTemplate(?=[A-Z])/g;
  const files = new Map<string, string>();
  for (const file of listFiles(templateDir)) {
    let text = readFileSync(join(templateDir, file), "utf8");
    if (file === "index.ts") {
      text = replaceOnce(
        text,
        'const ID = "hello";',
        `const ID = "${id}";`,
        file,
      );
      text = replaceOnce(text, 'name: "Hello",', `name: "${title}",`, file);
    }
    files.set(file.replace(prefix, pascal), text.replace(prefix, pascal));
  }
  for (const [file, text] of files) {
    for (const left of ['"hello"', '"Hello"']) {
      if (text.includes(left) || file.includes(left)) {
        refuse(`the template changed: ${file} still holds ${left}`);
      }
    }
    if (/\bTemplate[A-Z]/.test(text) || /\bTemplate[A-Z]/.test(file)) {
      refuse(`the template changed: ${file} still holds a Template name`);
    }
  }

  // Just above each marker, in the marker's own indentation.
  const out = [...lines];
  const indent = /^\s*/.exec(lines[entries[0]])?.[0] ?? "";
  out.splice(entries[0], 0, `${indent}${camel},`);
  out.splice(imports[0], 0, `import ${camel} from "@/apps/${id}";`);

  return { folder, files, registry, registryText: out.join("\n") };
}

/**
 * Writes the folder first and the registry last. A registry that imports a
 * missing folder breaks the build; an orphan folder does not, so a failure
 * removes the folder.
 */
function apply(p: Plan): void {
  try {
    mkdirSync(p.folder);
    for (const [file, text] of p.files) {
      const target = join(p.folder, file);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, text);
    }
    writeFileSync(p.registry, p.registryText);
  } catch (err) {
    rmSync(p.folder, { recursive: true, force: true });
    throw err;
  }
}

/** Returns the exit code. */
export function main(args: string[], io: Io, defaultRoot: string): number {
  try {
    const { values, positionals } = parseArgs({
      args,
      options: { root: { type: "string" } },
      allowPositionals: true,
      strict: true,
    });
    if (positionals.length !== 1) refuse(USAGE);
    const id = positionals[0];
    if (!ID_RULE.test(id)) {
      refuse(`"${id}" is not a kebab-case id (like music-player). ${USAGE}`);
    }

    const root = resolve(values.root ?? defaultRoot);
    const names = namesFor(id);
    const p = plan(root, names);
    apply(p);

    for (const file of p.files.keys())
      io.out(`created ${APPS_DIR}/${id}/${file}`);
    io.out(`updated ${REGISTRY}`);
    io.out(
      "next: edit name, window size, dock and showInAppGrid in index.ts, " +
        "rewrite the component, then npm run check (docs/APPS.md)",
    );
    return 0;
  } catch (err) {
    io.err(`new-app: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = main(
    process.argv.slice(2),
    { out: (line) => console.log(line), err: (line) => console.error(line) },
    fileURLToPath(new URL("..", import.meta.url)),
  );
}
