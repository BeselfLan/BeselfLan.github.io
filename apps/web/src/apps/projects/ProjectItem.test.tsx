import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { staticContent } from "@/content/static";
import { EntryIcon } from "./EntryIcon";
import { ProjectItem } from "./ProjectItem";

// The two pieces that #83's ring and #18's panel build on: the props, the data
// attributes and the sizes are what those issues rely on.

function entry(id: string) {
  const found = staticContent.entry(id);
  if (!found) throw new Error(`no entry ${id}`);
  return found;
}
const bash = entry("bash-shell"); // featured: a drawn icon
const pong = entry("pong"); // not featured: a tile

const img = (c: HTMLElement) => c.querySelector("img");
const tile = (c: HTMLElement) =>
  c.querySelector<HTMLElement>("[data-icon-tile]");

describe("EntryIcon", () => {
  it("draws featured entries", () => {
    const { container, rerender } = render(<EntryIcon entry={bash} />);
    const image = img(container);
    expect(image?.getAttribute("src")).toBe("/icons/entries/bash-shell.svg");
    expect(image?.getAttribute("alt")).toBe("");
    expect(image?.getAttribute("aria-hidden")).toBe("true");
    expect(image?.getAttribute("width")).toBe("96");
    expect(image?.getAttribute("height")).toBe("96");
    expect(tile(container)).toBeNull();

    rerender(<EntryIcon entry={bash} size={128} />);
    expect(img(container)?.getAttribute("width")).toBe("128");
    expect(img(container)?.getAttribute("height")).toBe("128");
  });

  it("tiles the rest", () => {
    const { container, rerender } = render(<EntryIcon entry={pong} />);
    expect(img(container)).toBeNull();
    const el = tile(container)!;
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.textContent).toBe("P");
    expect(el.style.width).toBe("96px");
    expect(el.style.height).toBe("96px");
    expect(el.style.backgroundColor).toBe("rgb(142, 45, 87)");
    // About 21 percent of the size for the corners, 40 percent for the text.
    expect(el.style.borderRadius).toBe("20px");
    expect(el.style.fontSize).toBe("38px");

    rerender(<EntryIcon entry={pong} size={128} />);
    const big = tile(container)!;
    expect(big.style.width).toBe("128px");
    expect(big.style.height).toBe("128px");
    expect(big.style.borderRadius).toBe("27px");
    expect(big.style.fontSize).toBe("51px");
  });

  it("gives each tile the colour of its own id", () => {
    const colours = ["fnaf-project", "pong", "edu-video-generator"].map(
      (id) => {
        const { container, unmount } = render(<EntryIcon entry={entry(id)} />);
        const colour = tile(container)!.style.backgroundColor;
        unmount();
        return colour;
      },
    );
    expect(colours).toEqual([
      "rgb(178, 58, 18)",
      "rgb(142, 45, 87)",
      "rgb(94, 39, 80)",
    ]);
  });

  it("follows the drawn-icon rule, not a field of its own", () => {
    // The same entry, but not featured: a tile with no file behind it.
    const { container } = render(
      <EntryIcon entry={{ ...bash, featured: false }} />,
    );
    expect(img(container)).toBeNull();
    expect(tile(container)?.textContent).toBe("BT");
  });
});

describe("ProjectItem", () => {
  it("is a button named by the title, with the id and no state", () => {
    const { container } = render(
      <ProjectItem entry={pong} selected={false} onClick={() => {}} />,
    );
    const button = screen.getByRole("button", { name: "Pong" });
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("data-entry-id")).toBe("pong");
    expect(button.hasAttribute("data-selected")).toBe(false);
    expect(button.hasAttribute("data-front")).toBe(false);
    expect(button.hasAttribute("tabindex")).toBe(false);
    // Selection has no ARIA until #18's panel; the title is not a heading.
    for (const name of ["aria-pressed", "aria-selected", "aria-expanded"]) {
      expect(button.hasAttribute(name), name).toBe(false);
    }
    expect(container.querySelector("h1, h2, h3, h4, h5, h6")).toBeNull();
  });

  it("holds the icon at 96 and the title", () => {
    const { container } = render(
      <ProjectItem entry={bash} selected={false} onClick={() => {}} />,
    );
    expect(img(container)?.getAttribute("width")).toBe("96");
    expect(container.querySelector("button")?.textContent).toBe(bash.title);
  });

  it("marks selected and front", () => {
    const { rerender } = render(
      <ProjectItem entry={pong} selected onClick={() => {}} />,
    );
    const button = screen.getByRole("button", { name: "Pong" });
    expect(button.hasAttribute("data-selected")).toBe(true);
    expect(button.hasAttribute("data-front")).toBe(false);

    rerender(
      <ProjectItem entry={pong} selected={false} front onClick={() => {}} />,
    );
    expect(button.hasAttribute("data-selected")).toBe(false);
    expect(button.hasAttribute("data-front")).toBe(true);
  });

  it("passes tabIndex and className through", () => {
    render(
      <ProjectItem
        entry={pong}
        selected={false}
        tabIndex={-1}
        className="x-test"
        onClick={() => {}}
      />,
    );
    const button = screen.getByRole("button", { name: "Pong" });
    expect(button.getAttribute("tabindex")).toBe("-1");
    expect(button.classList.contains("x-test")).toBe(true);
    // The base classes stay when a class is added.
    expect(button.classList.contains("h-[150px]")).toBe(true);
    expect(button.classList.contains("w-[150px]")).toBe(true);
  });

  it("shows selection with the outline classes, and focus with its own", () => {
    const { rerender } = render(
      <ProjectItem entry={pong} selected={false} onClick={() => {}} />,
    );
    const button = screen.getByRole("button", { name: "Pong" });
    expect(button.classList.contains("outline-os-accent")).toBe(false);
    expect(button.classList.contains("focus-visible:outline-white")).toBe(true);

    rerender(<ProjectItem entry={pong} selected onClick={() => {}} />);
    expect(button.classList.contains("outline-os-accent")).toBe(true);
    expect(button.classList.contains("outline-2")).toBe(true);
    expect(button.classList.contains("focus-visible:outline-white")).toBe(true);
  });

  it("gives its button to a callback ref", () => {
    const ref = vi.fn();
    render(
      <ProjectItem
        ref={ref}
        entry={pong}
        selected={false}
        onClick={() => {}}
      />,
    );
    const button = screen.getByRole("button", { name: "Pong" });
    expect(ref).toHaveBeenCalledWith(button);
  });

  it("calls onClick once per click", () => {
    const onClick = vi.fn();
    render(<ProjectItem entry={pong} selected={false} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Pong" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
