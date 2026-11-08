import type { BootMode } from "./stages";

// The one place that chooses how `/` boots. Every load plays the full boot
// today. #14 fills this in from `?boot=`, the session flag, deep links and
// reduced motion. Its mount effect in BootSequence reads the URL from
// `window.location.search`, not from `useSearchParams`, so the page needs no
// Suspense boundary and the static export stays whole. This runs in an effect,
// never during render, so it may read the browser then.
export function initialMode(): BootMode {
  return "full";
}
