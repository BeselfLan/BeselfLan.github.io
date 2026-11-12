import type { Entry } from "@beself/content";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { staticContent } from "@/content/static";
import type { MediaProvider, MediaStatus } from "@/media/provider";
import { Screen } from "@/os/screen/Screen";
import {
  setupBrowser,
  teardownBrowser,
} from "../../../tests/unit/window/mountLayer";
import { DetailPanel, type DetailPanelProps } from "./DetailPanel";

// The panel inside the real Screen, because Play's Tooltip portals into it:
// outside a Screen it never shows. The api is a fake with the real content.
// Only setTimeout is faked (for the Tooltip's 400 ms delay); promises settle in
// microtasks, which `flush` runs inside act().

beforeEach(() => {
  setupBrowser();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
  teardownBrowser();
});

const FIXTURE = (id: string) => ({
  id,
  sources: [
    { src: `https://example.test/media/${id}.webm`, type: "video/webm" },
    { src: `https://example.test/media/${id}.mp4`, type: "video/mp4" },
  ],
  poster: `https://example.test/media/${id}.jpg`,
  width: 640,
  height: 360,
  durationMs: 1000,
});

const flush = () =>
  act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });

function entryOf(id: string) {
  const found = staticContent.entry(id);
  if (!found) throw new Error(`no entry ${id}`);
  return found;
}

function makeApi(
  resolve: MediaProvider["resolve"] = (id) => Promise.resolve(FIXTURE(id)),
  status: MediaStatus = "online",
) {
  const openApp = vi.fn(() => "w");
  const media = { resolve: vi.fn(resolve), status: vi.fn(() => status) };
  const api: DetailPanelProps["api"] = {
    content: staticContent,
    openApp,
    media,
  };
  return { api, openApp, media };
}

function ui(
  entry: Entry | string,
  api: DetailPanelProps["api"],
  onClose: () => void = () => {},
) {
  return (
    <Screen>
      <DetailPanel
        id="detail"
        entry={typeof entry === "string" ? entryOf(entry) : entry}
        api={api}
        onClose={onClose}
      />
    </Screen>
  );
}

/** What a sighted visitor reads: the text without the `.sr-only` parts. */
function visibleText(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  for (const hidden of copy.querySelectorAll(".sr-only")) hidden.remove();
  return (copy.textContent ?? "").trim();
}

const tooltip = () => document.querySelector('[role="tooltip"]');

const play = () => screen.queryByRole("button", { name: "Play demo" });
const playButton = () => screen.getByRole("button", { name: "Play demo" });

describe("DetailPanel", () => {
  it("shows the entry in plan 5.4's order", async () => {
    const { api } = makeApi();
    const { container } = render(ui("deadknight", api));
    await flush();

    const aside = container.querySelector("aside")!;
    const heading = screen.getByRole("heading", {
      level: 3,
      name: "DeadKnight -- Roguelite Platformer",
    });
    // The aside is named by its heading, and has the id the ring points at.
    expect(aside.id).toBe("detail");
    expect(aside.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(
      screen.getByRole("complementary", { name: heading.textContent! }),
    ).toBe(aside);

    // The icon, the title, the summary, in that order.
    const icon = aside.querySelector("img")!;
    expect(icon.getAttribute("src")).toBe("/icons/entries/deadknight.svg");
    expect(icon.getAttribute("width")).toBe("128");
    const summary = screen.getByText(
      "A team roguelite platformer in Java with procedural levels and A* enemy pathfinding.",
    );
    const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(icon.compareDocumentPosition(heading) & FOLLOWING).toBeTruthy();
    expect(heading.compareDocumentPosition(summary) & FOLLOWING).toBeTruthy();

    // The kind chip and the years, between the title and the summary.
    const kind = within(aside).getByText("Project");
    const years = within(aside).getByText("2024");
    expect(heading.compareDocumentPosition(kind) & FOLLOWING).toBeTruthy();
    expect(kind.compareDocumentPosition(years) & FOLLOWING).toBeTruthy();
    expect(years.compareDocumentPosition(summary) & FOLLOWING).toBeTruthy();

    // Tech chips, in `tech` order, named by the skills' names.
    const tech = screen.getByRole("group", { name: "Built with" });
    expect(
      within(tech)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Java", "Git", "GitHub"]);

    // Four bullets, and nothing else is a list item.
    expect(screen.getAllByRole("listitem")).toHaveLength(4);

    // One link, opened in a new tab without handing over the opener.
    const links = screen.getAllByRole("link");
    expect(links.map(visibleText)).toEqual(["GitHub"]);
    expect(links[0].getAttribute("href")).toBe(
      "https://github.com/KenC2006/DeadKnight",
    );
    expect(links[0].getAttribute("target")).toBe("_blank");
    expect(links[0].getAttribute("rel")).toContain("noopener");

    expect(play()).not.toBeNull();

    // None of the ring's markers, which the ring's counters select on.
    expect(
      aside.querySelectorAll("[data-entry-id], [data-selected], [data-front]"),
    ).toHaveLength(0);
  });

  it("shows the org and role, and draws no empty group", () => {
    const { api, media } = makeApi();
    const { container } = render(ui("thornhill-cs-club", api));
    expect(
      screen.getByText("Executive · Thornhill Secondary School"),
    ).toBeTruthy();
    expect(screen.getByText("Experience")).toBeTruthy();
    expect(screen.getByText("2021–2024")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Built with" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Links" })).toBeNull();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(play()).toBeNull();
    expect(media.resolve).not.toHaveBeenCalled();
    expect(container.querySelectorAll("h4")).toHaveLength(0);
  });

  it("leaves out the years of an unknown start and the role line of none", () => {
    const { api } = makeApi();
    const base = entryOf("pong");
    const entry = {
      ...base,
      period: { start: "unknown" as const },
      role: undefined,
      org: undefined,
    };
    const { container } = render(ui(entry, api));
    // The heading, then the kind chip alone, then the summary: no years and
    // no empty role line between them.
    const aside = container.querySelector("aside")!;
    const paragraphs = [...aside.querySelectorAll("p")].map(
      (p) => p.textContent,
    );
    expect(paragraphs).toEqual([base.summary]);
    expect(
      within(aside).getByText("Project").parentElement?.children,
    ).toHaveLength(1);
  });

  it("opens Skills at the skill of a tech chip", async () => {
    const { api, openApp } = makeApi();
    render(ui("deadknight", api));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Java" }));
    expect(openApp).toHaveBeenCalledTimes(1);
    expect(openApp).toHaveBeenCalledWith("skills", { item: "java" });
  });

  it("names a tech chip by its skill, and by its id when the skill is unknown", () => {
    const { api, openApp } = makeApi();
    const entry = {
      ...entryOf("tetris-asm"),
      tech: ["mips-asm", "no-such-skill"],
    };
    render(ui(entry, api));
    const tech = screen.getByRole("group", { name: "Built with" });
    expect(
      within(tech)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["MIPS Assembly", "no-such-skill"]);
    fireEvent.click(screen.getByRole("button", { name: "no-such-skill" }));
    expect(openApp).toHaveBeenCalledWith("skills", { item: "no-such-skill" });
  });

  it("lists the links in GitHub, Website, Live demo order", () => {
    const { api } = makeApi();
    const entry = {
      ...entryOf("tetris-asm"),
      links: {
        demo: "https://demo.example/",
        site: "https://site.example/",
        github: "https://github.com/x/y",
      },
    };
    render(ui(entry, api));
    const group = screen.getByRole("group", { name: "Links" });
    const links = within(group).getAllByRole("link");
    expect(links.map((a) => [visibleText(a), a.getAttribute("href")])).toEqual([
      ["GitHub", "https://github.com/x/y"],
      ["Website", "https://site.example/"],
      ["Live demo", "https://demo.example/"],
    ]);
    for (const a of links) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  it("links say they open a new tab", () => {
    const { api } = makeApi();
    const entry = {
      ...entryOf("tetris-asm"),
      links: {
        demo: "https://demo.example/",
        site: "https://site.example/",
        github: "https://github.com/x/y",
      },
    };
    render(ui(entry, api));
    const group = screen.getByRole("group", { name: "Links" });
    for (const name of ["GitHub", "Website", "Live demo"]) {
      const link = within(group).getByRole("link", {
        name: `${name} (opens in a new tab)`,
      });
      // The visible text is the label alone.
      expect(visibleText(link)).toBe(name);
    }
  });

  describe("Play", () => {
    it("opens the demo", async () => {
      const { api, openApp } = makeApi();
      render(ui("deadknight", api));
      await flush();

      const button = playButton();
      expect((button as HTMLButtonElement).disabled).toBe(false);
      expect(button.getAttribute("data-media")).toBe("ready");
      fireEvent.click(button);
      expect(openApp).toHaveBeenCalledTimes(1);
      expect(openApp).toHaveBeenCalledWith("video-player", {
        projectId: "deadknight",
        title: "DeadKnight -- Roguelite Platformer",
      });
    });

    it("asks for the video's id and opens the entry's id", async () => {
      // The video of FNAF Project is "fnaf", so the media id is not the entry id.
      const { api, openApp, media } = makeApi();
      render(ui("fnaf-project", api));
      await flush();
      expect(media.resolve).toHaveBeenCalledTimes(1);
      expect(media.resolve).toHaveBeenCalledWith("fnaf");

      fireEvent.click(playButton());
      expect(openApp).toHaveBeenCalledWith("video-player", {
        projectId: "fnaf-project",
        title: "FNAF Project",
      });
    });

    it("is enabled while the provider is still being asked", async () => {
      const { api, openApp } = makeApi(() => new Promise(() => {}));
      render(ui("deadknight", api));
      await flush();

      const button = playButton();
      expect((button as HTMLButtonElement).disabled).toBe(false);
      expect(button.getAttribute("data-media")).toBe("checking");
      fireEvent.click(button);
      expect(openApp).toHaveBeenCalledWith("video-player", {
        projectId: "deadknight",
        title: "DeadKnight -- Roguelite Platformer",
      });
    });

    it.each<[string, MediaProvider["resolve"], MediaStatus]>([
      ["resolve gives null", () => Promise.resolve(null), "online"],
      [
        "the status is offline",
        (id) => Promise.resolve(FIXTURE(id)),
        "offline",
      ],
      ["resolve rejects", () => Promise.reject(new Error("no")), "online"],
    ])("says Demo offline when %s", async (_name, resolve, status) => {
      const { api, openApp } = makeApi(resolve, status);
      render(ui("deadknight", api));
      await flush();

      const button = playButton() as HTMLButtonElement;
      // aria-disabled, not disabled: it can still take focus.
      expect(button.getAttribute("aria-disabled")).toBe("true");
      expect(button.disabled).toBe(false);
      expect(button.getAttribute("data-media")).toBe("offline");

      // The wrapper hears the hover of the button.
      fireEvent.pointerEnter(button, { pointerType: "mouse" });
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(tooltip()?.textContent).toBe("Demo offline");

      fireEvent.click(button);
      expect(openApp).not.toHaveBeenCalled();
    });

    it("offline Play is reachable and says why", async () => {
      const { api, openApp } = makeApi(() => Promise.resolve(null));
      render(ui("deadknight", api));
      await flush();

      const button = playButton() as HTMLButtonElement;
      expect(button.getAttribute("aria-disabled")).toBe("true");
      // `disabled` would make it unreachable by keyboard.
      expect(button.disabled).toBe(false);
      act(() => button.focus());
      expect(document.activeElement).toBe(button);
      // Keyboard focus shows the tooltip at once, and points the button at it.
      expect(tooltip()?.textContent).toBe("Demo offline");
      expect(button.getAttribute("aria-describedby")).toBe(tooltip()?.id);

      fireEvent.click(button);
      expect(openApp).not.toHaveBeenCalled();
    });

    it("Play stays one element when the answer arrives", async () => {
      let answer!: (found: null) => void;
      const { api } = makeApi(
        () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      );
      render(ui("deadknight", api));
      await flush();

      const button = playButton();
      expect(button.getAttribute("data-media")).toBe("checking");
      act(() => button.focus());
      expect(tooltip()).toBeNull();

      answer(null);
      await flush();
      // The same node, still focused, and now disabled in the aria sense.
      expect(playButton()).toBe(button);
      expect(document.activeElement).toBe(button);
      expect(button.getAttribute("data-media")).toBe("offline");
      expect(button.getAttribute("aria-disabled")).toBe("true");
      // The tooltip anchored when it got focus, and only `disabled` gated it.
      expect(tooltip()?.textContent).toBe("Demo offline");
    });

    it("an online Play shows no tooltip", async () => {
      const { api } = makeApi();
      render(ui("deadknight", api));
      await flush();

      const button = playButton();
      expect(button.getAttribute("data-media")).toBe("ready");
      expect(button.hasAttribute("aria-disabled")).toBe(false);
      act(() => button.focus());
      expect(document.activeElement).toBe(button);
      expect(tooltip()).toBeNull();
      expect(button.hasAttribute("aria-describedby")).toBe(false);

      // Nor on hover.
      fireEvent.pointerEnter(button, { pointerType: "mouse" });
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(tooltip()).toBeNull();
    });

    it("is absent without a video, and nothing is asked", async () => {
      const { api, media } = makeApi();
      render(ui("tetris-asm", api));
      await flush();
      expect(play()).toBeNull();
      expect(media.resolve).not.toHaveBeenCalled();
    });

    it("ignores a late answer for another entry", async () => {
      let late!: (found: null) => void;
      const { api } = makeApi((id) =>
        id === "deadknight"
          ? new Promise((resolve) => {
              late = resolve;
            })
          : Promise.resolve(FIXTURE(id)),
      );
      const { rerender } = render(ui("deadknight", api));
      await flush();
      expect(playButton().getAttribute("data-media")).toBe("checking");

      // Another entry takes the panel over, and its video resolves.
      rerender(ui("3d-engine", api));
      await flush();
      expect(playButton().getAttribute("data-media")).toBe("ready");

      // The first entry's answer arrives late, and says offline.
      late(null);
      await flush();
      const button = playButton() as HTMLButtonElement;
      expect(button.disabled).toBe(false);
      expect(button.getAttribute("data-media")).toBe("ready");
    });
  });

  it("calls onClose from the X", async () => {
    const { api } = makeApi();
    const onClose = vi.fn();
    render(ui("tetris-asm", api, onClose));
    fireEvent.click(screen.getByRole("button", { name: "Close details" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
