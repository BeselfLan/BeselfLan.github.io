import type { ComponentProps, MouseEvent } from "react";

export type ButtonVariant = "default" | "primary" | "ghost";

// `primary` is dark on orange: white on this orange is about 3.6:1, and dark
// is about 5:1 (plan 8 asks for 4.5:1). A disabled button ignores the pointer
// so a `Tooltip` around it still gets the hover. So does one with
// `aria-disabled`, which looks the same but can still be focused, so its
// tooltip can be heard from the keyboard.
const BASE =
  "inline-flex items-center justify-center gap-2 rounded-os-sm px-3 py-1.5 text-sm font-medium " +
  "outline-offset-2 focus-visible:outline-2 focus-visible:outline-os-accent " +
  "disabled:pointer-events-none disabled:opacity-50 " +
  "aria-disabled:pointer-events-none aria-disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  default: "bg-white/10 text-os-panel-fg hover:bg-white/20",
  primary: "bg-os-accent text-os-dark hover:brightness-110",
  ghost: "bg-transparent text-os-panel-fg hover:bg-white/10",
};

export type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
};

// What Enter and Space fire is a click, so this is the whole press.
const swallow = (e: MouseEvent<HTMLButtonElement>) => e.preventDefault();

/**
 * `type` defaults to "button", so a form around it does not submit.
 * `aria-disabled` looks disabled and ignores the press, but keeps keyboard
 * focus (the `disabled` attribute does not).
 */
export function Button({
  variant = "default",
  type = "button",
  className,
  onClick,
  ...rest
}: ButtonProps) {
  const classes = `${BASE} ${VARIANTS[variant]}${className ? ` ${className}` : ""}`;
  const ariaDisabled =
    rest["aria-disabled"] === true || rest["aria-disabled"] === "true";
  return (
    <button
      type={type}
      className={classes}
      onClick={ariaDisabled ? swallow : onClick}
      {...rest}
    />
  );
}
