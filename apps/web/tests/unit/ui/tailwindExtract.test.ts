// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Scanner } from "@tailwindcss/oxide";
import { describe, expect, it } from "vitest";

// Tailwind reads class names as plain text. A class glued to a template
// placeholder, as in `p-1${x}`, is lost: the scanner does not yield `p-1`, so
// the class is never generated and the build looks fine. Each file is scanned
// on its own: `text-os-panel-fg` and `focus-visible:outline-os-accent` are
// used elsewhere too, so a whole-build check cannot see them go missing here.
// Tailwind scans this file as well and finds the class names written below, so
// once it exists a build also contains `p-1` and `outline-none`: check the
// build by hand with this file moved away, and rely on this test otherwise.

const scan = (content: string) =>
  new Scanner({}).scanFiles([{ content, extension: "tsx" }]);

function source(file: string): string {
  const path = fileURLToPath(
    new URL(`../../../src/os/ui/${file}`, import.meta.url),
  );
  return readFileSync(path, "utf8");
}

// `marker` picks the one template line the class sits in. Chip's span and
// button both use `text-os-panel-fg`, so a scan of the whole file would pass
// with either template broken; the line alone cannot.
const cases: [file: string, name: string, marker: string][] = [
  ["Menu.tsx", "p-1", "min-w-40 flex-col p-1"],
  ["Popover.tsx", "outline-none", "shadow-os-popover outline-none"],
  ["Chip.tsx", "text-os-panel-fg", "${SHAPE} bg-white/10 text-os-panel-fg"],
  [
    "Chip.tsx",
    "focus-visible:outline-os-accent",
    "outline-offset-2 focus-visible:outline-2 focus-visible:outline-os-accent",
  ],
];

describe("Tailwind extracts the os/ui template classes", () => {
  it.each(cases)("%s yields %s", (file, name, marker) => {
    const text = source(file);
    expect(scan(text)).toContain(name);

    const line = text.split("\n").find((l) => l.includes(marker));
    expect(line, `no line in ${file} holds ${marker}`).toBeDefined();
    expect(scan(line!)).toContain(name);
  });
});
