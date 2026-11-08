import type { ReactNode } from "react";

export type IconProps = {
  size?: number;
  /** Without a label the icon is decoration and is hidden from screen readers. */
  label?: string;
  className?: string;
} & (
  | { src: string; children?: never }
  | { src?: never; children: ReactNode; viewBox?: string }
);

/**
 * Either inline SVG shapes (drawn in `currentColor`, on a 24 unit grid) or a
 * file under `public/icons` through `src`.
 */
export function Icon(props: IconProps) {
  const { size = 16, label, className } = props;
  const hidden = label ? undefined : true;

  if (props.src !== undefined) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- images.unoptimized is on, so next/image adds nothing
      <img
        src={props.src}
        alt={label ?? ""}
        width={size}
        height={size}
        aria-hidden={hidden}
        className={className}
      />
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={props.viewBox ?? "0 0 24 24"}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={hidden}
      className={className}
    >
      {props.children}
    </svg>
  );
}
