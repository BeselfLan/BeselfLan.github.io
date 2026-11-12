import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { alphaOf, contrast, hex, over } from "./contrast.testutil";
import { Signature } from "./Signature";

// The signature sits in the bottom right of the wallpaper, over a gradient
// that axe cannot measure. So the contrast is worked out here, from the
// alphas in the component's own classes.

// The last stop of aubergine.svg's gradient: the brightest colour any of the
// wallpapers has in the bottom right corner.
const CORNER = hex("#e95420");
const BLACK = hex("#000000");
const WHITE = hex("#ffffff");

function mount() {
  const { container } = render(<Signature />);
  const box = container.querySelector<HTMLElement>("[data-signature]")!;
  return { box, lines: [...box.querySelectorAll("p")] };
}

describe("the signature", () => {
  it("reads at 4.5:1 over the brightest corner", () => {
    const { box, lines } = mount();
    expect(lines).toHaveLength(2);

    // No scrim class means no scrim.
    const scrim = alphaOf(box.className, "bg-black") ?? 0;
    const backdrop = over(BLACK, scrim, CORNER);

    for (const line of lines) {
      const alpha = alphaOf(line.className, "text-white");
      expect(alpha, `no text-white/NN class on "${line.textContent}"`).not.toBe(
        null,
      );
      const ratio = contrast(over(WHITE, alpha!, backdrop), backdrop);
      expect(
        ratio,
        `"${line.textContent}" is ${ratio.toFixed(2)}:1 over the corner`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("would fail without the scrim", () => {
    // The same maths with no scrim: the tagline falls short, so the test
    // above can fail.
    const { lines } = mount();
    const tagline = lines[1];
    const alpha = alphaOf(tagline.className, "text-white")!;
    expect(contrast(over(WHITE, alpha, CORNER), CORNER)).toBeLessThan(4.5);
  });

  it("still takes no pointer events", () => {
    const { box } = mount();
    expect(box.classList.contains("pointer-events-none")).toBe(true);
  });
});
