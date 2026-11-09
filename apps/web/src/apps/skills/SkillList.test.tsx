import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { staticContent } from "@/content/static";
import { SkillList, type SkillListProps } from "./SkillList";
import { CATEGORY_LABEL, practicesOf, skillsFor } from "./tabs";

// The list with the real content: the Tools tab, which lists 17 skills, and the
// four practices after them.

const TOOLS = skillsFor("tool", staticContent);
const PRACTICES = practicesOf(staticContent);

function setup(over: Partial<SkillListProps> = {}) {
  const onSelect = vi.fn();
  const props: SkillListProps = {
    skills: TOOLS,
    practices: PRACTICES,
    selectedId: null,
    onSelect,
    panelId: "panel-1",
    reserve: 0,
    ...over,
  };
  const el = (p: SkillListProps = props): ReactElement => <SkillList {...p} />;
  return { el, onSelect };
}

const cards = (c: HTMLElement, group: string) => [
  ...c.querySelectorAll<HTMLButtonElement>(`[${group}] [data-skill-card]`),
];

describe("SkillList", () => {
  it("Tools: 17 cards in content order, then the 4 practices", () => {
    const { el } = setup();
    const { container } = render(el());

    expect(TOOLS).toHaveLength(17);
    const tools = cards(container, "data-skill-cards");
    expect(tools.map((b) => b.dataset.skillCard)).toEqual(
      TOOLS.map((s) => s.id),
    );
    expect(tools[0].dataset.skillCard).toBe("git");
    for (const [i, b] of tools.entries()) {
      expect(b.tagName).toBe("BUTTON");
      expect(b.querySelector("[data-skill-icon]")).not.toBeNull();
      expect(b.textContent).toContain(TOOLS[i].name);
      expect(b.textContent).toContain(CATEGORY_LABEL[TOOLS[i].category]);
    }

    const practices = cards(container, "data-skill-practices");
    expect(practices.map((b) => b.dataset.skillCard)).toEqual([
      "oop",
      "agile",
      "rest-api",
      "oauth-jwt",
    ]);
    for (const b of practices) expect(b.textContent).toContain("Practice");
    // The practices come after the tools in the document.
    expect(
      tools[16].compareDocumentPosition(practices[0]) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("names the practices section", () => {
    const { el } = setup();
    render(el());
    const region = screen.getByRole("region", { name: "Practices" });
    expect(region.querySelectorAll("[data-skill-card]")).toHaveLength(4);
  });

  it("leaves the section out when there are no practices", () => {
    const { el } = setup({ practices: [] });
    const { container } = render(el());
    expect(screen.queryByRole("region", { name: "Practices" })).toBeNull();
    expect(container.querySelector("[data-skill-practices]")).toBeNull();
  });

  it("a click calls onSelect with the card's id", () => {
    const { el, onSelect } = setup();
    const { container } = render(el());
    fireEvent.click(cards(container, "data-skill-cards")[2]);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(TOOLS[2].id);
    fireEvent.click(cards(container, "data-skill-practices")[1]);
    expect(onSelect).toHaveBeenLastCalledWith("agile");
  });

  it("shows the selection on the open card only", () => {
    const { el } = setup({ selectedId: "git" });
    const { container } = render(el());
    const all = [
      ...cards(container, "data-skill-cards"),
      ...cards(container, "data-skill-practices"),
    ];
    expect(
      all
        .filter((b) => b.hasAttribute("data-selected"))
        .map((b) => b.dataset.skillCard),
    ).toEqual(["git"]);
    for (const b of all) {
      const open = b.dataset.skillCard === "git";
      expect(b.getAttribute("aria-expanded")).toBe(String(open));
      expect(b.getAttribute("aria-controls")).toBe(open ? "panel-1" : null);
    }
  });

  it("selects a practice card", () => {
    const { el } = setup({ selectedId: "oop" });
    const { container } = render(el());
    const oop = container.querySelector<HTMLElement>(
      '[data-skill-practices] [data-skill-card="oop"]',
    )!;
    expect(oop.hasAttribute("data-selected")).toBe(true);
    expect(oop.getAttribute("aria-controls")).toBe("panel-1");
  });

  it("keeps room for the open panel", () => {
    const shut = setup();
    const a = render(shut.el());
    expect(
      a.container.querySelector<HTMLElement>("[data-skill-list]")!.style
        .paddingRight,
    ).toBe("");
    a.unmount();

    const open = setup({ reserve: 340 });
    const b = render(open.el());
    expect(
      b.container.querySelector<HTMLElement>("[data-skill-list]")!.style
        .paddingRight,
    ).toBe("356px");
  });
});
