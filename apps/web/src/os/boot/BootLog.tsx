import { STATUS_LABEL, type BootLine } from "./bootScript";

// The printed lines of the boot log (plan 3.3). The caller slices the script,
// so this draws only what has been printed.
//
// The container is a column that ends at the bottom and clips at the top. The
// newest line is always at the bottom and older lines scroll off the top: the
// auto-scroll of 3.3 with no scroll code and no layout reads. It is
// aria-hidden because it grows by dozens of lines in two seconds; a screen
// reader gets the one live region in BootSequence instead. Whitespace is kept
// (pre-wrap) so the label column's padding survives, and long lines wrap.

type Labelled = keyof typeof STATUS_LABEL;

// Whole literal strings, so Tailwind finds each class.
const LABEL_CLASS: Record<Labelled, string> = {
  ok: "text-green-400",
  info: "text-cyan-400",
  warn: "text-yellow-300",
};

/** The text of the last header line, or "" when none has printed. */
export function newestHeader(lines: readonly BootLine[]): string {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].status === "header") return lines[i].text;
  }
  return "";
}

function LogLine({ line }: { line: BootLine }) {
  const { status, text } = line;
  if (status === "header" || status === "text") {
    return (
      <div
        data-boot-line=""
        data-status={status}
        className={status === "header" ? "shrink-0 font-bold" : "shrink-0"}
      >
        {text}
      </div>
    );
  }
  return (
    <div data-boot-line="" data-status={status} className="shrink-0">
      [<span className={LABEL_CLASS[status]}>{STATUS_LABEL[status]}</span>]{" "}
      {text}
    </div>
  );
}

export function BootLog({ lines }: { lines: readonly BootLine[] }) {
  return (
    <div
      data-boot-log=""
      aria-hidden="true"
      className="absolute inset-0 flex flex-col justify-end overflow-hidden p-6 pb-16 font-mono text-base leading-5 wrap-break-word whitespace-pre-wrap text-os-panel-fg"
    >
      {/* The list only grows, so the index is a stable key. */}
      {lines.map((line, i) => (
        <LogLine key={i} line={line} />
      ))}
    </div>
  );
}
