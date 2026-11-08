// @vitest-environment node
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// Plan 3.4: apps reach the OS only through AppApi, so nothing under src/apps
// may import the store. The ESLint Node API loads the whole Next config, which
// takes a few seconds.

const cwd = fileURLToPath(new URL("../../..", import.meta.url));
const eslint = new ESLint({ cwd });

/** The no-restricted-imports reports for `code`, as if it lived at `file`. */
async function restricted(code: string, file: string) {
  const [result] = await eslint.lintText(code, { filePath: join(cwd, file) });
  return result.messages.filter((m) => m.ruleId === "no-restricted-imports");
}

const APP_FILE = "src/apps/demo/x.ts";
const OS_FILE = "src/os/demo/x.ts";

describe("apps cannot import the store", () => {
  it.each([
    'import { os } from "@/os/store";',
    'import { os } from "../../os/store";',
    'import { os } from "../../../os/store/windows";',
    'import { useOS } from "@/os/store/shell";',
    'export { os } from "@/os/store";',
  ])(
    "%s from an app is reported",
    async (code) => {
      const found = await restricted(code, APP_FILE);
      expect(found).toHaveLength(1);
      expect(found[0].message).toContain("AppApi");
    },
    30_000,
  );

  it("the same import from the OS is not", async () => {
    expect(
      await restricted('import { os } from "@/os/store";', OS_FILE),
    ).toEqual([]);
  }, 30_000);

  it.each([
    'import { Button } from "@/os/ui/Button";',
    'import { defineApp } from "@/os/apps/types";',
    'import { useWindowVisible } from "@/os/window/useWindowVisible";',
    'import { thing } from "./store";',
  ])(
    "%s from an app is allowed",
    async (code) => {
      expect(await restricted(code, APP_FILE)).toEqual([]);
    },
    30_000,
  );
});
