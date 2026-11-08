import { fireEvent, render, screen, within } from "@testing-library/react";
import { MotionConfig } from "motion/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { staticContent } from "@/content/static";
import type { Shortcut } from "@/os/input/shortcuts";
import { SkillPanel, type SkillPanelProps } from "./SkillPanel";

// The panel with the real content and a fake api, outside a Screen. The fake
// `registerShortcut` keeps the shortcut it is given and hands back an
// unregister function the test can watch.

function setup(over: Partial<SkillPanelProps> = {}) {
  const shortcuts: Shortcut[] = [];
  const unregister = vi.fn();
  const registerShortcut = vi.fn((s: Shortcut) => {
    shortcuts.push(s);
    return unregister;
  });
  const openApp = vi.fn();
  const onClose = vi.fn();
  const props: SkillPanelProps = {
    id: "panel-1",
    skillId: "python",
    api: { content: staticContent, openApp, registerShortcut },
    onClose,
    ...over,
  };
  const el = (p: SkillPanelProps = props): ReactElement => (
    <SkillPanel {...p} />
  );
  return {
    props,
    el,
    shortcuts,
    unregister,
    registerShortcut,
    openApp,
    onClose,
  };
}

const skill = (id: string) =>
  staticContent.skillsWithUsage().find((s) => s.id === id)!;
const h3 = (name: string) => screen.getByRole("heading", { level: 3, name });
const h4 = (name: string) => screen.getByRole("heading", { level: 4, name });

describe("SkillPanel", () => {
  it("python: shows the emblem, the name, the category, both texts and Used in", () => {
    const { el, openApp } = setup();
    const { container } = render(el());
    const python = skill("python");

    expect(h3("Python")).toBeTruthy();
    expect(container.querySelector("[data-skill-icon]")).not.toBeNull();
    expect(screen.getByText("Language")).toBeTruthy();

    // Each text follows its heading, compared with the content's own strings.
    expect(h4("What it is").nextElementSibling?.textContent).toBe(
      python.description,
    );
    expect(h4("How I've used it").nextElementSibling?.textContent).toBe(
      python.howIUsedIt,
    );

    const list = h4("Used in").nextElementSibling as HTMLElement;
    const chips = within(list).getAllByRole("button");
    expect(chips.map((c) => c.textContent)).toEqual(
      python.usedIn.map((e) => e.title),
    );
    expect(chips[0].textContent).toBe("Bash Terminal Recreation in C");

    fireEvent.click(chips[0]);
    expect(openApp).toHaveBeenCalledTimes(1);
    expect(openApp).toHaveBeenCalledWith("projects", { item: "bash-shell" });
  });

  it("is a labelled aside with the id its opener names", () => {
    const { el } = setup();
    const { container } = render(el());
    const aside = container.querySelector<HTMLElement>("[data-skill-panel]")!;
    expect(aside.tagName).toBe("ASIDE");
    expect(aside.id).toBe("panel-1");
    expect(screen.getByRole("complementary", { name: "Python" })).toBe(aside);
  });

  it("no usage, no section", () => {
    const { el } = setup({ skillId: "excel" });
    render(el());
    expect(skill("excel").usedIn).toHaveLength(0);
    expect(h3(skill("excel").name)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Used in" })).toBeNull();
    // The other two sections stay.
    expect(h4("What it is")).toBeTruthy();
    expect(h4("How I've used it")).toBeTruthy();
  });

  it("practice: shows the Practice chip", () => {
    const { el } = setup({ skillId: "oop" });
    render(el());
    expect(h3(skill("oop").name)).toBeTruthy();
    expect(screen.getByText("Practice")).toBeTruthy();
  });

  it("renders nothing for a skill that does not exist", () => {
    const { el } = setup({ skillId: "nope" });
    const { container } = render(el());
    expect(container.firstChild).toBeNull();
  });

  describe("close", () => {
    it("the X calls onClose", () => {
      const { el, onClose } = setup();
      render(el());
      fireEvent.click(screen.getByRole("button", { name: "Close panel" }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("registers Escape through the api, and its handler calls onClose", () => {
      const { el, onClose, registerShortcut, shortcuts } = setup();
      render(el());
      expect(registerShortcut).toHaveBeenCalledTimes(1);
      expect(shortcuts[0].combo).toBe("Escape");
      shortcuts[0].handler(new KeyboardEvent("keydown", { key: "Escape" }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not listen to the window itself", () => {
      const { el, onClose } = setup();
      render(el());
      fireEvent.keyDown(window, { key: "Escape" });
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(onClose).not.toHaveBeenCalled();
    });

    it("unregisters on unmount", () => {
      const { el, unregister } = setup();
      const view = render(el());
      expect(unregister).not.toHaveBeenCalled();
      view.unmount();
      expect(unregister).toHaveBeenCalledTimes(1);
    });

    it("registers once for the life of the panel, and calls the latest onClose", () => {
      const { el, props, registerShortcut, shortcuts, unregister, onClose } =
        setup();
      const view = render(el());
      const latest = vi.fn();
      view.rerender(el({ ...props, onClose: latest, skillId: "java" }));
      expect(registerShortcut).toHaveBeenCalledTimes(1);
      expect(unregister).not.toHaveBeenCalled();
      shortcuts[0].handler(new KeyboardEvent("keydown", { key: "Escape" }));
      expect(latest).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("the slide", () => {
    const aside = (c: HTMLElement) =>
      c.querySelector<HTMLElement>("[data-skill-panel]")!;

    it("slides in at 340 wide over 250 ms, unless motion is reduced", () => {
      const { el } = setup();
      const { container } = render(el());
      expect(aside(container).classList.contains("skills-panel")).toBe(true);
      expect(aside(container).classList.contains("skills-panel-enter")).toBe(
        true,
      );
      expect(aside(container).style.width).toBe("340px");
      expect(aside(container).style.getPropertyValue("--skills-panel-ms")).toBe(
        "250ms",
      );
    });

    it("arrives at once under reduced motion", () => {
      const { el } = setup();
      const { container } = render(
        <MotionConfig reducedMotion="always">{el()}</MotionConfig>,
      );
      expect(aside(container).classList.contains("skills-panel")).toBe(true);
      expect(aside(container).classList.contains("skills-panel-enter")).toBe(
        false,
      );
    });

    it("covers the whole stage in the fullscreen mode", () => {
      const { el } = setup({ full: true });
      const { container } = render(el());
      expect(aside(container).style.width).toBe("100%");
    });
  });

  it("a new skill starts at the top", () => {
    const { el, props } = setup();
    const view = render(el());
    const aside =
      view.container.querySelector<HTMLElement>("[data-skill-panel]")!;
    // jsdom does no layout, so the element keeps the value it is given.
    let top = 50;
    Object.defineProperty(aside, "scrollTop", {
      configurable: true,
      get: () => top,
      set: (v: number) => {
        top = v;
      },
    });
    view.rerender(el({ ...props, skillId: "java" }));
    expect(h3("Java")).toBeTruthy();
    expect(top).toBe(0);
  });
});
