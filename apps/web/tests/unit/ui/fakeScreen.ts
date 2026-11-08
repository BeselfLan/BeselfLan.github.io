import { afterEach, beforeEach, vi } from "vitest";
import type { ScreenValue } from "@/os/screen/Screen";

interface Options {
  scale?: number;
  /** Where the screen box sits in the page, in client px. */
  left?: number;
  top?: number;
}

/**
 * A `ScreenValue` with a real portal target 1440x900. `toScreenPoint` is the
 * real formula with a fixed box offset, so a test sees a dropped offset.
 */
export function fakeScreen({
  scale = 0.5,
  left = 20,
  top = 10,
}: Options = {}): ScreenValue {
  const portalTarget = document.createElement("div");
  // Own properties win over the prototype getter that setupFakeScreen mocks.
  Object.defineProperty(portalTarget, "offsetWidth", { value: 1440 });
  Object.defineProperty(portalTarget, "offsetHeight", { value: 900 });
  document.body.append(portalTarget);
  return {
    scale,
    mode: "laptop",
    workArea: { x: 64, y: 32, w: 1376, h: 868 },
    toScreenPoint: (x, y) => ({ x: (x - left) / scale, y: (y - top) / scale }),
    portalTarget,
  };
}

/**
 * Call at the top of a test file that mocks `useScreen` to return
 * `holder.value`. Every element measures 200x100, because jsdom measures 0.
 */
export function setupFakeScreen(
  holder: { value: ScreenValue },
  options?: Options,
) {
  beforeEach(() => {
    holder.value = fakeScreen(options);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(100);
  });
  afterEach(() => {
    holder.value.portalTarget?.remove();
    vi.restoreAllMocks();
  });
}
