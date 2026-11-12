"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { os, rehydrateSettings } from "../store";
import {
  initialWindows,
  type Point,
  type ScreenMode,
  type WorkArea,
} from "../store/windows";

const VIRTUAL = { width: 1440, height: 900 };
// Below 900 px wide, or a coarse pointer held in portrait.
const FULLSCREEN_QUERY =
  "(max-width: 899.98px), (pointer: coarse) and (orientation: portrait)";

export interface ScreenValue {
  scale: number;
  mode: ScreenMode;
  workArea: WorkArea;
  /** Client coordinates to screen coordinates. Needs a resting (untransformed) box. */
  toScreenPoint(clientX: number, clientY: number): Point;
  /** Inside the scaled box; null on the server and before mount. */
  portalTarget: HTMLElement | null;
}

const ScreenContext = createContext<ScreenValue | null>(null);

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(FULLSCREEN_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const getSnapshot = (): ScreenMode =>
  window.matchMedia(FULLSCREEN_QUERY).matches ? "fullscreen" : "laptop";

/**
 * The mode comes from the viewport, not the container: a parent may resize
 * the container when the mode changes, so a container check would flip-flop.
 * Works above `Screen`. The server and first client render say "laptop".
 */
export function useScreenMode(): ScreenMode {
  return useSyncExternalStore(subscribe, getSnapshot, () => "laptop");
}

export function useScreen(): ScreenValue {
  const value = useContext(ScreenContext);
  if (!value) throw new Error("useScreen must be used inside Screen");
  return value;
}

/** The screen around this component, or null outside a Screen. */
export function useOptionalScreen(): ScreenValue | null {
  return useContext(ScreenContext);
}

// Reserves the same strips as the laptop work area: y at the top, and x at
// the bottom instead of the side.
function workAreaFor(mode: ScreenMode, size: typeof VIRTUAL): WorkArea {
  if (mode === "laptop") return initialWindows.workArea;
  const { x: dock, y: bar } = initialWindows.workArea;
  return {
    x: 0,
    y: bar,
    w: size.width,
    h: Math.max(0, size.height - bar - dock),
  };
}

/** Fills its parent: a virtual 1440x900 box scaled to fit, or 1:1 in fullscreen. */
export function Screen({ children }: { children: ReactNode }) {
  const mode = useScreenMode();
  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(VIRTUAL);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  // contentRect ignores CSS transforms, so a parent may transform this.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width === 0 || height === 0) return;
      setSize((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height },
      );
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const fullscreen = mode === "fullscreen";
  const scale = fullscreen
    ? 1
    : Math.min(size.width / VIRTUAL.width, size.height / VIRTUAL.height);
  const box = fullscreen ? size : VIRTUAL;
  const left = fullscreen ? 0 : (size.width - box.width * scale) / 2;
  const top = fullscreen ? 0 : (size.height - box.height * scale) / 2;
  const workArea = useMemo(() => workAreaFor(mode, size), [mode, size]);

  // Layout effects, in this order: a child's plain effect runs before its
  // parent's plain effect but after every layout effect.
  useLayoutEffect(() => {
    rehydrateSettings();
  }, []);
  useLayoutEffect(() => {
    os.windows.setScreen({ mode, workArea });
  }, [mode, workArea]);

  const toScreenPoint = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = boxRef.current?.getBoundingClientRect();
      return {
        x: (clientX - (rect?.left ?? 0)) / scale,
        y: (clientY - (rect?.top ?? 0)) / scale,
      };
    },
    [scale],
  );

  const value = useMemo<ScreenValue>(
    () => ({ scale, mode, workArea, toScreenPoint, portalTarget }),
    [scale, mode, workArea, toScreenPoint, portalTarget],
  );

  return (
    <div ref={rootRef} className="relative h-full w-full overflow-hidden">
      <div
        ref={boxRef}
        data-screen-box=""
        className="absolute origin-top-left overflow-hidden [transform:scale(var(--s))]"
        style={
          {
            left,
            top,
            width: box.width,
            height: box.height,
            "--s": scale,
          } as CSSProperties
        }
      >
        <ScreenContext value={value}>
          <div className="absolute inset-0 isolate">{children}</div>
          <div
            ref={setPortalTarget}
            data-screen-portal=""
            className="pointer-events-none absolute inset-0"
          />
        </ScreenContext>
      </div>
    </div>
  );
}
