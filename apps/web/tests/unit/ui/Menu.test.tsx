import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ScreenValue } from "@/os/screen/Screen";
import { Menu, type MenuItem } from "@/os/ui/Menu";
import { Popover } from "@/os/ui/Popover";
import { setupFakeScreen } from "./fakeScreen";

const fake = vi.hoisted(() => ({ value: undefined as unknown as ScreenValue }));
vi.mock("@/os/screen/Screen", () => ({ useScreen: () => fake.value }));
setupFakeScreen(fake);

const anchor = { left: 120, top: 60, width: 0, height: 0 };

function items(
  onSelect: (id: string) => void,
  disabled: readonly string[] = [],
): MenuItem[] {
  return ["a", "b", "c"].map((id) => ({
    id,
    label: id.toUpperCase(),
    disabled: disabled.includes(id),
    onSelect: () => onSelect(id),
  }));
}
const active = () => document.activeElement?.textContent;

describe("Menu", () => {
  it("renders MenuItems", () => {
    render(
      <Menu items={items(vi.fn())} onClose={() => {}} aria-label="Edit" />,
    );
    expect(screen.getByRole("menu", { name: "Edit" })).toBeTruthy();
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("focuses the first item", () => {
    render(<Menu items={items(vi.fn())} onClose={() => {}} />);
    expect(active()).toBe("A");
  });

  it("a disabled item cannot be chosen", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<Menu items={items(onSelect, ["a"])} onClose={onClose} />);
    const disabled = screen.getByRole("menuitem", { name: "A" });

    fireEvent.click(disabled);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    // Focus skipped the disabled item, so Enter chooses the next one.
    expect(active()).toBe("B");
    await user.keyboard("{Enter}");
    expect(onSelect.mock.calls).toEqual([["b"]]);

    await user.click(disabled);
    expect(onSelect.mock.calls).toEqual([["b"]]);
  });

  it("arrows move and skip disabled items", async () => {
    const user = userEvent.setup();
    render(<Menu items={items(vi.fn(), ["b"])} onClose={() => {}} />);
    expect(active()).toBe("A");
    await user.keyboard("{ArrowDown}");
    expect(active()).toBe("C");
    await user.keyboard("{ArrowDown}");
    expect(active()).toBe("A");
    await user.keyboard("{ArrowUp}");
    expect(active()).toBe("C");
    await user.keyboard("{Home}");
    expect(active()).toBe("A");
    await user.keyboard("{End}");
    expect(active()).toBe("C");
  });

  it("arrows with nothing to focus do nothing", () => {
    render(<Menu items={items(vi.fn(), ["a", "b", "c"])} onClose={() => {}} />);
    const menu = screen.getByRole("menu");
    expect(() => fireEvent.keyDown(menu, { key: "ArrowDown" })).not.toThrow();
  });

  it("Enter chooses", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<Menu items={items(onSelect)} onClose={onClose} />);
    await user.keyboard("{Enter}");
    expect(onSelect.mock.calls).toEqual([["a"]]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Esc closes without choosing", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<Menu items={items(onSelect)} onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("Space chooses too", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Menu items={items(onSelect)} onClose={() => {}} />);
    await user.keyboard("{ArrowDown}{ }");
    expect(onSelect.mock.calls).toEqual([["b"]]);
  });

  it("a separator is not focusable", async () => {
    const user = userEvent.setup();
    const list: MenuItem[] = [
      { id: "a", label: "A", onSelect: () => {} },
      { id: "s", separator: true },
      { id: "c", label: "C", onSelect: () => {} },
    ];
    render(<Menu items={list} onClose={() => {}} />);
    await user.keyboard("{ArrowDown}");
    expect(active()).toBe("C");
    const separator = screen.getByRole("separator");
    expect(separator.hasAttribute("tabindex")).toBe(false);
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
  });

  it("choosing closes first", async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    render(
      <Menu
        items={items(() => calls.push("select"))}
        onClose={() => calls.push("close")}
      />,
    );
    await user.click(screen.getByRole("menuitem", { name: "C" }));
    expect(calls).toEqual(["close", "select"]);
  });

  it("Tab closes and is not prevented", () => {
    const onClose = vi.fn();
    render(<Menu items={items(vi.fn())} onClose={onClose} />);
    const notPrevented = fireEvent.keyDown(document.activeElement!, {
      key: "Tab",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(notPrevented).toBe(true);
  });
});

describe("Menu inside a Popover", () => {
  function tree(open: boolean, onClose: () => void, extra = vi.fn()) {
    return (
      <>
        <button data-testid="trigger">open</button>
        <Popover
          open={open}
          anchor={anchor}
          onClose={onClose}
          role="presentation"
        >
          <Menu items={items(extra)} onClose={onClose} />
        </Popover>
      </>
    );
  }

  it("Esc closes once", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(tree(true, onClose));
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("focus returns to the trigger", () => {
    const { rerender } = render(tree(false, () => {}));
    const trigger = screen.getByTestId("trigger");
    trigger.focus();

    rerender(tree(true, () => {}));
    expect(active()).toBe("A");

    rerender(tree(false, () => {}));
    expect(document.activeElement).toBe(trigger);
  });

  it("an outside press closes it", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(tree(true, onClose));
    await user.click(screen.getByTestId("trigger"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("focus lands after the popover is shown", () => {
    const seen: (string | undefined)[] = [];
    const focus = HTMLElement.prototype.focus;
    vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (
      this: HTMLElement,
      ...args: Parameters<HTMLElement["focus"]>
    ) {
      seen.push(this.closest<HTMLElement>("[data-popover]")?.style.visibility);
      return focus.apply(this, args);
    });
    render(tree(true, () => {}));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen).not.toContain("hidden");
    expect(seen).toContain("visible");
  });
});
