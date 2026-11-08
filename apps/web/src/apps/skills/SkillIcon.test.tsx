import { render } from "@testing-library/react";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { staticContent } from "@/content/static";
import { SkillIcon } from "./SkillIcon";

const python = staticContent.skill("python")!;

describe("SkillIcon", () => {
  it("draws the emblem", () => {
    const { container } = render(<SkillIcon skill={python} size={56} />);
    const icons = container.querySelectorAll("span[data-skill-icon]");
    expect(icons).toHaveLength(1);
    const el = icons[0] as HTMLElement;
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.textContent).toBe("Py");
    expect(el.style.width).toBe("56px");
    expect(el.style.height).toBe("56px");
    expect(el.style.borderRadius).toBe("50%");
    expect(el.style.boxSizing).toBe("border-box");
    expect(el.style.backgroundColor).toBe("rgb(247, 247, 247)");
    expect(el.style.borderWidth).toBe("4px");
    expect(el.style.borderStyle).toBe("solid");
    // Python's own colour, #3776AB.
    expect(el.style.borderColor).toBe("rgb(55, 118, 171)");
    expect(el.style.color).toBe("rgb(44, 0, 30)");
    expect(el.style.fontSize).toBe("20px");
  });

  it("scales with its size", () => {
    const { container } = render(<SkillIcon skill={python} size={72} />);
    const el = container.querySelector<HTMLElement>("[data-skill-icon]")!;
    expect(el.style.width).toBe("72px");
    expect(el.style.height).toBe("72px");
    expect(el.style.fontSize).toBe("26px");
    expect(el.style.borderWidth).toBe("5px");
  });

  it("takes the ring from each skill", () => {
    const { container } = render(
      <>
        {staticContent.skills().map((s) => (
          <SkillIcon key={s.id} skill={s} size={56} />
        ))}
      </>,
    );
    const icons = [...container.querySelectorAll<HTMLElement>("span")];
    expect(icons).toHaveLength(49);
    // Two skills that differ in colour do not share a ring.
    const rings = new Set(icons.map((el) => el.style.borderColor));
    expect(rings.size).toBeGreaterThan(20);
    expect(
      icons.every((el) => /^rgb\(\d+, \d+, \d+\)$/.test(el.style.borderColor)),
    ).toBe(true);
  });

  it("uses no image for any skill", () => {
    const { container } = render(
      <>
        {staticContent.skills().map((s) => (
          <SkillIcon key={s.id} skill={s} size={56} />
        ))}
      </>,
    );
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.querySelectorAll("[src]")).toHaveLength(0);
    expect(container.querySelectorAll("[data-skill-icon]")).toHaveLength(49);
  });
});

// The legacy PNGs of plan 6.7 are deleted. With no SVG directly in this
// folder, packages/content's "every skill icon file exists" stays skipped.
describe("public/icons/skills", () => {
  const dir = join(import.meta.dirname, "../../../public/icons/skills");

  /** Every file below `root`, at any depth. */
  const files = (root: string): string[] =>
    readdirSync(root, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(join(root, e.name)) : [join(root, e.name)],
    );

  it("holds no legacy file", () => {
    // The folder may not exist at all.
    const found = existsSync(dir) ? files(dir) : [];
    expect(found).toEqual([]);
  });

  it("has no SVG directly inside it", () => {
    const direct = existsSync(dir)
      ? readdirSync(dir).filter((f) => f.endsWith(".svg"))
      : [];
    expect(direct).toEqual([]);
  });
});
