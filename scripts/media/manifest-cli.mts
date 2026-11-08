// The command line behind convert.sh and sync.sh:
//   manifest-cli.mts add <manifest.json> <id>   (ffprobe JSON on stdin)
//   manifest-cli.mts check <manifest.json>
import { readFileSync } from "node:fs";
import {
  checkManifest,
  entryFromProbe,
  readManifest,
  upsert,
  writeManifest,
} from "./manifest.mts";

export interface Io {
  stdin(): string;
  out(line: string): void;
  err(line: string): void;
}

const USAGE =
  "usage: manifest-cli.mts add <manifest.json> <id> | check <manifest.json>";

/** Returns the exit code. */
export function main(args: string[], io: Io): number {
  const [command, file, id] = args;
  try {
    if (command === "add" && file && id && args.length === 3) {
      const entry = entryFromProbe(id, JSON.parse(io.stdin()));
      writeManifest(file, upsert(readManifest(file), entry));
      io.out(JSON.stringify(entry));
      return 0;
    }
    if (command === "check" && file && args.length === 2) {
      const problems = checkManifest(file);
      for (const problem of problems) io.err(problem);
      return problems.length === 0 ? 0 : 1;
    }
    io.err(`manifest: ${USAGE}`);
  } catch (err) {
    io.err(`manifest: ${err instanceof Error ? err.message : String(err)}`);
  }
  return 1;
}

if (import.meta.main) {
  process.exitCode = main(process.argv.slice(2), {
    stdin: () => readFileSync(0, "utf8"),
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  });
}
