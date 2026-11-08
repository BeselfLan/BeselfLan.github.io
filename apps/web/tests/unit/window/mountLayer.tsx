import type { ReactNode } from "react";
import { act, render } from "@testing-library/react";
import { vi } from "vitest";
import { Screen } from "@/os/screen/Screen";
import { os, useOS } from "@/os/store";
import type { Point, WindowApp } from "@/os/store/windows";
import { WindowLayer, type WindowChrome } from "@/os/window/WindowLayer";
import { FakeResizeObserver, stubFrames, stubMedia } from "../helpers/browser";

// A helper for the window tests, not a test file.

export interface TestApp {
  id: string;
  width?: number;
  height?: number;
  at?: Point;
  minimize?: boolean;
  maximize?: boolean;
  close?: boolean;
  chrome?: "default" | "none";
  alwaysOnTop?: boolean;
  /** `chromeOf` returns undefined, so the frame falls back. */
  unknownChrome?: boolean;
}

// One map feeds both the store's lookup and chromeOf, so they always agree.
const apps = new Map<string, TestApp>();

export function register(...list: TestApp[]): void {
  for (const app of list) apps.set(app.id, app);
}

function lookup(appId: string): WindowApp | undefined {
  const a = apps.get(appId);
  if (!a) return undefined;
  return {
    id: a.id,
    name: a.id,
    window: {
      width: a.width ?? 400,
      height: a.height ?? 300,
      initialPosition: a.at ?? { x: 200, y: 100 },
    },
    capabilities: {
      maximize: a.maximize ?? false,
      alwaysOnTop: a.alwaysOnTop ?? false,
    },
    singleton: true,
  };
}

// A plain function, not a vi.fn, so restoreAllMocks cannot touch it.
export function chromeOf(appId: string): WindowChrome | undefined {
  const a = apps.get(appId);
  if (!a || a.unknownChrome) return undefined;
  return {
    minimize: a.minimize ?? true,
    maximize: a.maximize ?? false,
    close: a.close ?? true,
    chrome: a.chrome,
  };
}

/** For beforeEach. Returns the frame queue and the pointer capture spy. */
export function setupBrowser({ fullscreen = false } = {}) {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  stubMedia(fullscreen);
  const frames = stubFrames();
  localStorage.clear();
  useOS.setState(useOS.getInitialState(), true);
  apps.clear();
  os.windows.setAppLookup(lookup);
  const setPointerCapture = vi.fn<(id: number) => void>();
  Element.prototype.setPointerCapture = setPointerCapture;
  return { frames, setPointerCapture };
}

/** For afterEach. */
export function teardownBrowser(): void {
  delete (Element.prototype as { setPointerCapture?: unknown })
    .setPointerCapture;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
}

// Module level, so its identity is stable and a frame does not re-render.
const defaultContent = (id: string): ReactNode => (
  <div data-testid={`content-${id}`} />
);

export function mountLayer({
  renderContent = defaultContent,
  children,
}: {
  renderContent?: (windowId: string) => ReactNode;
  children?: ReactNode;
} = {}) {
  return render(
    <Screen>
      <WindowLayer chromeOf={chromeOf} renderContent={renderContent}>
        {children}
      </WindowLayer>
    </Screen>,
  );
}

export function open(id: string): void {
  act(() => {
    os.windows.openApp(id);
  });
}

export const frameOf = (id: string) =>
  document.querySelector<HTMLElement>(`[data-window-id="${id}"]`);

export const titleBarOf = (id: string) =>
  frameOf(id)?.querySelector<HTMLElement>("[data-titlebar]") ?? null;

/** The labels of the bar's buttons, in DOM order. */
export const buttonNames = (id: string): (string | null)[] =>
  [...(titleBarOf(id)?.querySelectorAll("button") ?? [])].map((b) =>
    b.getAttribute("aria-label"),
  );

/** A pointer event init: a jsdom PointerEvent defaults isPrimary to false. */
export const ptr = (over: object = {}) => ({
  pointerId: 1,
  button: 0,
  isPrimary: true,
  clientX: 300,
  clientY: 120,
  ...over,
});

export const windowState = (id: string) =>
  useOS.getState().windows.items.find((w) => w.id === id);
