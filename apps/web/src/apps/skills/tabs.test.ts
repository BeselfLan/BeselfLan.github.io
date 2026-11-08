// @vitest-environment node
import { describe, expect, it } from "vitest";
import { staticContent } from "@/content/static";
import {
  CATEGORY_LABEL,
  DEFAULT_TAB,
  isTabId,
  practicesOf,
  skillsFor,
  TABS,
  viewFor,
  visibleIn,
  type TabId,
} from "./tabs";

// Taken before any selector runs, so a selector that sorts or changes the
// content package's own array shows up in the last test.
const SKILLS = staticContent.skills();
const ORDER_BEFORE = SKILLS.map((s) => s.id);
const LENGTH_BEFORE = SKILLS.length;

const ids = (list: readonly { id: string }[]) => list.map((s) => s.id);
const skill = (id: string) => {
  const found = staticContent.skill(id);
  if (!found) throw new Error(`no skill ${id}`);
  return found;
};

describe("the tabs", () => {
  it("are All, Languages, Frameworks, Libraries and Tools", () => {
    expect(TABS.map((t) => t.label)).toEqual([
      "All",
      "Languages",
      "Frameworks",
      "Libraries",
      "Tools",
    ]);
    expect(TABS.map((t) => t.id)).toEqual([
      "all",
      "language",
      "framework",
      "library",
      "tool",
    ]);
    expect(DEFAULT_TAB).toBe("all");
  });

  it("knows its ids and nothing else", () => {
    for (const t of TABS) expect(isTabId(t.id)).toBe(true);
    expect(isTabId("tool")).toBe(true);
    expect(isTabId("practice")).toBe(false);
    expect(isTabId("Tools")).toBe(false);
    expect(isTabId("")).toBe(false);
    expect(isTabId(undefined)).toBe(false);
    expect(isTabId(null)).toBe(false);
    expect(isTabId(1)).toBe(false);
  });
});

describe("skillsFor", () => {
  it("lists every skill but the practices under All, in content order", () => {
    const all = skillsFor("all", staticContent);
    expect(all).toHaveLength(45);
    expect(all[0].id).toBe("python");
    expect(all[all.length - 1].id).toBe("sharepoint");
    expect(all.some((s) => s.category === "practice")).toBe(false);
    // The same relative order as the content package, with the practices out.
    expect(ids(all)).toEqual(
      ORDER_BEFORE.filter((id) => skill(id).category !== "practice"),
    );
  });

  it("lists one category under its tab, in content order", () => {
    const counts: [TabId, number][] = [
      ["language", 12],
      ["framework", 7],
      ["library", 9],
      ["tool", 17],
    ];
    for (const [tab, n] of counts) {
      const list = skillsFor(tab, staticContent);
      expect(list, tab).toHaveLength(n);
      for (const s of list) expect(s.category).toBe(tab);
      expect(ids(list)).toEqual(
        ORDER_BEFORE.filter((id) => skill(id).category === tab),
      );
    }
    expect(skillsFor("tool", staticContent)[0].id).toBe("git");
    expect(skillsFor("language", staticContent)[0].id).toBe("python");
  });

  it("splits the content: the tabs and the practices cover every skill", () => {
    const total = 45 + practicesOf(staticContent).length; // All plus the practices
    expect(total).toBe(LENGTH_BEFORE);
    const byTab = ["language", "framework", "library", "tool"].flatMap((t) =>
      ids(skillsFor(t as TabId, staticContent)),
    );
    expect(byTab.sort()).toEqual(ids(skillsFor("all", staticContent)).sort());
  });
});

describe("practicesOf", () => {
  it("gives the four practices in content order", () => {
    expect(ids(practicesOf(staticContent))).toEqual([
      "oop",
      "agile",
      "rest-api",
      "oauth-jwt",
    ]);
  });
});

describe("CATEGORY_LABEL", () => {
  it("names each category in the singular", () => {
    expect(CATEGORY_LABEL).toEqual({
      language: "Language",
      framework: "Framework",
      library: "Library",
      tool: "Tool",
      practice: "Practice",
    });
  });
});

describe("visibleIn", () => {
  const tabs = TABS.map((t) => t.id);

  it("shows a language under All and Languages only", () => {
    const python = skill("python");
    expect(tabs.filter((t) => visibleIn(python, t))).toEqual([
      "all",
      "language",
    ]);
    expect(visibleIn(python, "tool")).toBe(false);
  });

  it("shows a practice under every tab", () => {
    const oop = skill("oop");
    expect(tabs.filter((t) => visibleIn(oop, t))).toEqual(tabs);
    expect(visibleIn(oop, "language")).toBe(true);
  });

  it("shows a tool under All and Tools only", () => {
    const git = skill("git");
    expect(tabs.filter((t) => visibleIn(git, t))).toEqual(["all", "tool"]);
  });

  it("agrees with skillsFor for every skill that has a tab", () => {
    for (const s of staticContent.skills()) {
      for (const t of tabs) {
        if (s.category === "practice") continue;
        expect(visibleIn(s, t), `${s.id} under ${t}`).toBe(
          ids(skillsFor(t, staticContent)).includes(s.id),
        );
      }
    }
  });
});

describe("viewFor", () => {
  const view = (args: { item?: unknown; tab?: unknown }) =>
    viewFor(args, staticContent);

  it("starts on All with nothing selected", () => {
    expect(view({})).toEqual({ tab: "all", selectedId: null });
  });

  it("starts on the tab the args name", () => {
    expect(view({ tab: "tool" })).toEqual({ tab: "tool", selectedId: null });
    expect(view({ tab: "library" })).toEqual({
      tab: "library",
      selectedId: null,
    });
  });

  it("selects the skill the args name", () => {
    expect(view({ item: "python" })).toEqual({
      tab: "all",
      selectedId: "python",
    });
  });

  it("switches to All when the skill is not under the tab", () => {
    expect(view({ item: "python", tab: "tool" })).toEqual({
      tab: "all",
      selectedId: "python",
    });
  });

  it("keeps the tab when the skill is under it", () => {
    expect(view({ item: "git", tab: "tool" })).toEqual({
      tab: "tool",
      selectedId: "git",
    });
  });

  it("keeps the tab for a practice, which is a chip under every tab", () => {
    expect(view({ item: "oop", tab: "language" })).toEqual({
      tab: "language",
      selectedId: "oop",
    });
    expect(view({ item: "oop" })).toEqual({ tab: "all", selectedId: "oop" });
  });

  it("ignores an unknown item or tab", () => {
    expect(view({ item: "nope" })).toEqual({ tab: "all", selectedId: null });
    expect(view({ tab: "bogus" })).toEqual({ tab: "all", selectedId: null });
    expect(view({ item: "nope", tab: "tool" })).toEqual({
      tab: "tool",
      selectedId: null,
    });
    expect(view({ item: "python", tab: "practice" })).toEqual({
      tab: "all",
      selectedId: "python",
    });
  });

  it("ignores an item that is not a string", () => {
    expect(view({ item: 7 })).toEqual({ tab: "all", selectedId: null });
    expect(view({ item: null, tab: "tool" })).toEqual({
      tab: "tool",
      selectedId: null,
    });
  });

  it("does not change the args it reads", () => {
    const args = Object.freeze({ item: "python", tab: "tool" });
    expect(() => view(args)).not.toThrow();
    expect(args).toEqual({ item: "python", tab: "tool" });
  });
});

describe("the shared list", () => {
  it("is left in its order, as the same array", () => {
    // Every selector has run in the tests above.
    skillsFor("all", staticContent);
    skillsFor("tool", staticContent);
    practicesOf(staticContent);
    viewFor({ item: "python", tab: "tool" }, staticContent);
    expect(staticContent.skills()).toBe(SKILLS);
    expect(SKILLS).toHaveLength(LENGTH_BEFORE);
    expect(ids(SKILLS)).toEqual(ORDER_BEFORE);
  });

  it("is never the array a selector returns", () => {
    expect(skillsFor("all", staticContent)).not.toBe(SKILLS);
    expect(practicesOf(staticContent)).not.toBe(SKILLS);
  });
});
