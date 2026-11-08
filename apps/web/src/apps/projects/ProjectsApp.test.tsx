import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { staticContent } from "@/content/static";
import type { AppApi } from "@/os/apps/types";
import { WindowIdContext } from "@/os/window/useWindowVisible";
import type { ProjectsArgs } from "./index";
import ProjectsApp from "./ProjectsApp";

// The component with an api of vi.fn()s and the real content. It renders
// outside a Screen, as registry.test.ts does, and imports nothing from
// os/store: the lint rule keeps apps away from it.

function makeApi(content: AppApi["content"] = staticContent) {
  const mocks = {
    close: vi.fn(),
    minimize: vi.fn(),
    focus: vi.fn(),
    setTitle: vi.fn(),
    openApp: vi.fn(),
    notify: vi.fn(),
    isVisible: vi.fn(() => true),
    subscribeVisible: vi.fn(() => () => {}),
    bounds: vi.fn(() => ({ width: 1040, height: 600 })),
    registerShortcut: vi.fn(() => () => {}),
  };
  const api = {
    ...mocks,
    content,
    media: { status: () => "unknown", resolve: vi.fn() },
  } as unknown as AppApi;
  return { api, mocks };
}

const ui = (api: AppApi, args: ProjectsArgs) => (
  <WindowIdContext value="projects">
    <ProjectsApp windowId="projects" args={args} api={api} />
  </WindowIdContext>
);

const FEATURED = [
  "bash-shell",
  "tetris-asm",
  "trivia-knockouts",
  "todo-fullstack",
  "invoice-creator",
  "painting-ml",
  "deadknight",
  "3d-engine",
  "competitive-programming",
  "portfolio-site",
  "emberhacks",
  "utmist-ai2",
  "thornhill-cs-club",
];

const chip = (name: string) =>
  within(screen.getByRole("group", { name: "Filter" })).getByRole("button", {
    name,
  });
const press = (name: string) => fireEvent.click(chip(name));
const ids = (c: HTMLElement) =>
  [...c.querySelectorAll("[data-entry-id]")].map((e) =>
    e.getAttribute("data-entry-id"),
  );
const item = (c: HTMLElement, id: string) =>
  c.querySelector<HTMLElement>(`[data-entry-id="${id}"]`)!;
const selected = (c: HTMLElement) =>
  [...c.querySelectorAll("[data-selected]")].map((e) =>
    e.getAttribute("data-entry-id"),
  );
const count = (c: HTMLElement) => c.querySelector("[data-count]")?.textContent;
const pressed = () =>
  Object.fromEntries(
    [
      "Featured",
      "All",
      "Projects",
      "Hackathons",
      "Experience",
      "Volunteer",
    ].map((n) => [n, chip(n).getAttribute("aria-pressed")]),
  );

describe("ProjectsApp", () => {
  it("keeps the Projects heading", () => {
    const { api } = makeApi();
    render(ui(api, {}));
    expect(screen.getAllByRole("heading", { name: "Projects" })).toHaveLength(
      1,
    );
    // Item titles are not headings, so /Projects/ matches only this one.
    expect(screen.getAllByRole("heading", { name: /Projects/ })).toHaveLength(
      1,
    );
  });

  it("opens on Featured", () => {
    const { api } = makeApi();
    const { container } = render(ui(api, {}));
    expect(pressed()).toEqual({
      Featured: "true",
      All: "false",
      Projects: "false",
      Hackathons: "false",
      Experience: "false",
      Volunteer: "false",
    });
    expect(count(container)).toBe("13 items");
    expect(ids(container)).toEqual(FEATURED);
    expect(container.querySelectorAll("[data-selected]")).toHaveLength(0);
  });

  it("labels the chips and announces the count politely", () => {
    const { api } = makeApi();
    const { container } = render(ui(api, {}));
    expect(screen.getByRole("group", { name: "Filter" })).toBeTruthy();
    expect(
      container.querySelector("[data-count]")?.getAttribute("aria-live"),
    ).toBe("polite");
  });

  it("filters with the chips", () => {
    const { api } = makeApi();
    const { container } = render(ui(api, {}));

    press("Hackathons");
    expect(count(container)).toBe("2 items");
    expect(ids(container)).toEqual(["emberhacks", "utmist-ai2"]);
    expect(pressed().Hackathons).toBe("true");
    expect(pressed().Featured).toBe("false");

    press("Experience");
    expect(count(container)).toBe("1 item");
    expect(ids(container)).toEqual(["thornhill-cs-club"]);

    press("Volunteer");
    expect(count(container)).toBe("3 items");

    press("Projects");
    expect(count(container)).toBe("17 items");

    press("All");
    expect(count(container)).toBe("23 items");
    const all = ids(container);
    expect(all).toHaveLength(23);
    expect(all[13]).toBe("kortright-volunteer");
    expect(all[22]).toBe("stock-change-predictor");
  });

  it("draws an icon for featured entries and a tile for the others", () => {
    const { api } = makeApi();
    const { container } = render(ui(api, {}));
    const img = item(container, "bash-shell").querySelector("img");
    expect(img?.getAttribute("src")).toBe("/icons/entries/bash-shell.svg");
    expect(img?.getAttribute("alt")).toBe("");
    expect(container.querySelectorAll("[data-icon-tile]")).toHaveLength(0);

    press("All");
    const pong = item(container, "pong");
    expect(pong.querySelector("[data-icon-tile]")?.textContent).toBe("P");
    expect(pong.querySelector("img")).toBeNull();
    expect(container.querySelectorAll("img")).toHaveLength(13);
    expect(container.querySelectorAll("[data-icon-tile]")).toHaveLength(10);
  });

  it("selects the entry that the args name", () => {
    const { api } = makeApi();
    const { container, unmount } = render(ui(api, { item: "pong" }));
    expect(pressed().All).toBe("true");
    expect(selected(container)).toEqual(["pong"]);
    unmount();

    // An item that is not an entry is ignored, and Featured stays.
    const again = render(ui(api, { item: "nope" }));
    expect(pressed().Featured).toBe("true");
    expect(selected(again.container)).toEqual([]);
  });

  it("starts on the chip that the args name", () => {
    const { api } = makeApi();
    const { container } = render(ui(api, { filter: "volunteer" }));
    expect(pressed().Volunteer).toBe("true");
    expect(count(container)).toBe("3 items");
  });

  it("applies new args when the window is opened again", () => {
    const { api } = makeApi();
    const { container, rerender } = render(ui(api, {}));
    expect(pressed().Featured).toBe("true");

    rerender(ui(api, { item: "emberhacks", filter: "hackathon" }));
    expect(pressed().Hackathons).toBe("true");
    expect(selected(container)).toEqual(["emberhacks"]);
    expect(ids(container)).toEqual(["emberhacks", "utmist-ai2"]);
  });

  it("keeps the visitor's view while the args are the same object", () => {
    const { api } = makeApi();
    const first: ProjectsArgs = { item: "pong" };
    const { container, rerender } = render(ui(api, first));
    press("Projects");
    expect(pressed().Projects).toBe("true");
    expect(selected(container)).toEqual(["pong"]);

    rerender(ui(api, first));
    expect(pressed().Projects).toBe("true");
    expect(selected(container)).toEqual(["pong"]);

    // A new object with the same content is a new open: the view is derived again.
    rerender(ui(api, { item: "pong" }));
    expect(pressed().All).toBe("true");
  });

  it("keeps a selection only while its entry is listed", () => {
    const { api } = makeApi();
    const { container } = render(ui(api, {}));
    press("All");
    fireEvent.click(item(container, "pong"));
    expect(selected(container)).toEqual(["pong"]);

    press("Projects");
    expect(selected(container)).toEqual(["pong"]);

    press("Hackathons");
    expect(selected(container)).toEqual([]);

    // The selection was cleared, not hidden.
    press("All");
    expect(selected(container)).toEqual([]);
  });

  it("selects one entry per click, and a second click keeps it", () => {
    const { api, mocks } = makeApi();
    const { container } = render(ui(api, {}));
    press("Hackathons");
    fireEvent.click(item(container, "utmist-ai2"));
    expect(selected(container)).toEqual(["utmist-ai2"]);

    fireEvent.click(item(container, "emberhacks"));
    expect(selected(container)).toEqual(["emberhacks"]);

    fireEvent.click(item(container, "emberhacks"));
    expect(selected(container)).toEqual(["emberhacks"]);

    // The app never writes its own args, its title or the URL.
    for (const [name, mock] of Object.entries(mocks)) {
      expect(mock, name).not.toHaveBeenCalled();
    }
  });

  it("says so when a filter lists nothing", () => {
    const empty: AppApi["content"] = {
      ...staticContent,
      entriesByKind: () => ({
        ...staticContent.entriesByKind(),
        volunteer: [],
      }),
    };
    const { api } = makeApi(empty);
    const { container } = render(ui(api, {}));
    press("Volunteer");
    expect(screen.getByText("Nothing here yet.")).toBeTruthy();
    expect(count(container)).toBe("0 items");
    expect(container.querySelectorAll("[data-entry-id]")).toHaveLength(0);
    expect(container.querySelector("[data-projects-grid]")).toBeNull();
  });

  it("neither sorts the shared lists nor changes the args", () => {
    const { api } = makeApi();
    const before = {
      all: staticContent.entries().map((e) => e.id),
      featured: staticContent.featuredEntries().map((e) => e.id),
    };
    const args = Object.freeze({ item: "pong" });
    const { container } = render(ui(api, args));
    press("Projects");
    press("All");
    expect(ids(container)).toHaveLength(23);
    expect(staticContent.entries().map((e) => e.id)).toEqual(before.all);
    expect(staticContent.featuredEntries().map((e) => e.id)).toEqual(
      before.featured,
    );
    expect(args).toEqual({ item: "pong" });
  });
});
