import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/os/ui/Button";
import { Chip } from "@/os/ui/Chip";
import { Icon } from "@/os/ui/Icon";

describe("Chip", () => {
  it.each([true, false])("exposes its state: selected=%s", (selected) => {
    render(
      <Chip selected={selected} onClick={() => {}}>
        React
      </Chip>,
    );
    const chip = screen.getByRole("button", { name: "React" });
    expect(chip.getAttribute("aria-pressed")).toBe(String(selected));
  });

  it("a toggle follows a changed state", () => {
    const { rerender } = render(<Chip selected={false}>React</Chip>);
    const chip = () => screen.getByRole("button", { name: "React" });
    expect(chip().getAttribute("aria-pressed")).toBe("false");
    rerender(<Chip selected>React</Chip>);
    expect(chip().getAttribute("aria-pressed")).toBe("true");
  });

  it("a plain label is not a button", () => {
    render(<Chip>Project</Chip>);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Project").tagName).toBe("SPAN");
  });

  it("an action chip has no pressed state", () => {
    const onClick = vi.fn();
    render(<Chip onClick={onClick}>Filter</Chip>);
    const chip = screen.getByRole("button", { name: "Filter" });
    expect(chip.hasAttribute("aria-pressed")).toBe(false);
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("Button", () => {
  it('defaults to type="button"', () => {
    const onSubmit = vi.fn((e: { preventDefault(): void }) =>
      e.preventDefault(),
    );
    const { rerender } = render(
      <form onSubmit={onSubmit}>
        <Button>Go</Button>
      </form>,
    );
    const button = screen.getByRole("button", { name: "Go" });
    expect(button.getAttribute("type")).toBe("button");
    fireEvent.click(button);
    expect(onSubmit).not.toHaveBeenCalled();

    // The same button as a submit button does submit: the check can fail.
    rerender(
      <form onSubmit={onSubmit}>
        <Button type="submit">Go</Button>
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("forwards its ref and props", () => {
    const ref = createRef<HTMLButtonElement>();
    const onClick = vi.fn();
    render(
      <Button
        ref={ref}
        aria-label="Reload"
        className="mine"
        variant="primary"
        onClick={onClick}
        disabled
      />,
    );
    const button = screen.getByRole("button", { name: "Reload" });
    expect(ref.current).toBe(button);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.classList.contains("mine")).toBe(true);
    expect(button.classList.contains("bg-os-accent")).toBe(true);
    expect(button.classList.contains("focus-visible:outline-os-accent")).toBe(
      true,
    );
  });

  it("each variant looks different", () => {
    const { rerender } = render(<Button variant="default">x</Button>);
    const classOf = () => screen.getByRole("button").className;
    const seen = new Set([classOf()]);
    rerender(<Button variant="primary">x</Button>);
    seen.add(classOf());
    rerender(<Button variant="ghost">x</Button>);
    seen.add(classOf());
    expect(seen.size).toBe(3);
  });

  it("a disabled button ignores the pointer, so a tooltip around it hears the hover", () => {
    render(<Button disabled>x</Button>);
    expect(
      screen
        .getByRole("button")
        .classList.contains("disabled:pointer-events-none"),
    ).toBe(true);
  });
});

describe("Icon", () => {
  const forms = {
    svg: (label?: string) => (
      <Icon label={label}>
        <path d="M0 0h24v24H0z" />
      </Icon>
    ),
    src: (label?: string) => <Icon src="/icons/apps/a.svg" label={label} />,
  };

  it.each(["svg", "src"] as const)(
    "is hidden from screen readers unless labelled: %s",
    (form) => {
      const { container, rerender } = render(forms[form]());
      expect(screen.queryByRole("img")).toBeNull();
      expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe(
        "true",
      );

      rerender(forms[form]("Terminal"));
      const icon = screen.getByRole("img", { name: "Terminal" });
      expect(icon.hasAttribute("aria-hidden")).toBe(false);
    },
  );

  it("sizes both forms, defaulting to 16", () => {
    const { container, rerender } = render(forms.svg());
    expect(container.firstElementChild?.getAttribute("width")).toBe("16");
    rerender(<Icon src="/x.svg" size={32} />);
    expect(container.firstElementChild?.getAttribute("width")).toBe("32");
    expect(container.firstElementChild?.getAttribute("height")).toBe("32");
  });

  it("draws in the text colour", () => {
    const { container } = render(forms.svg());
    expect(container.firstElementChild?.getAttribute("stroke")).toBe(
      "currentColor",
    );
  });
});
