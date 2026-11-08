"use client";

import { Component, Suspense, useMemo, useState, type ReactNode } from "react";
import { os, useOS, type OSState } from "../store";
import { Button } from "../ui/Button";
import { createAppApi } from "./appApi";
import type { AnyAppDefinition } from "./types";

export type AppLookup = (appId: string) => AnyAppDefinition | undefined;

/**
 * Selectors for the two fields of a window that the app depends on, each
 * remembering the last value it saw. The window object is never selected:
 * moveWindow makes a new one on every drag tick, and that must not re-render
 * the app. `args` keeps its reference until a re-open replaces it. The memory
 * keeps the host rendering through the exit fade, after the window has left
 * the store (the same job as WindowFrame's lastKnownWindow).
 */
function lastKnownFields(windowId: string) {
  let last: { appId: string; args: unknown } | undefined;
  const read = (s: OSState) => {
    const w = s.windows.items.find((x) => x.id === windowId);
    if (w && (last?.appId !== w.appId || last.args !== w.args)) {
      last = { appId: w.appId, args: w.args };
    }
    return last;
  };
  return {
    appId: (s: OSState) => read(s)?.appId,
    args: (s: OSState) => read(s)?.args,
  };
}

interface BoundaryProps {
  appName: string;
  onReload(): void;
  children: ReactNode;
}

// A class, because only a class can be an error boundary. One per window, so
// a crash stays in its window.
class AppBoundary extends Component<BoundaryProps, { crashed: boolean }> {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  // Here and not in getDerivedStateFromError, which React may call twice in
  // Strict Mode. Plan 4.6 lists an app crash as a notification source.
  componentDidCatch() {
    os.notifications.push({ title: `${this.props.appName} crashed` });
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <div
        role="alert"
        className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center text-sm"
      >
        <p>This app crashed.</p>
        <Button onClick={this.props.onReload}>Reload</Button>
      </div>
    );
  }
}

/**
 * Loads one window's app behind a skeleton and keeps its crashes inside the
 * window. It reads `appId` and `args` from the window, so a re-open with new
 * args re-renders the app.
 *
 * The component is a `React.lazy`, and lazy caches a failed import: Reload
 * after a chunk-load failure shows the crash again. Accepted in v1; the fix is
 * a retrying loader in the app's own index.ts.
 */
export function AppHost({
  windowId,
  lookup,
}: {
  windowId: string;
  lookup: AppLookup;
}) {
  const [fields] = useState(() => lastKnownFields(windowId));
  const appId = useOS(fields.appId);
  const args = useOS(fields.args);
  const app = appId === undefined ? undefined : lookup(appId);
  const api = useMemo(
    () => (app ? createAppApi(windowId, app) : null),
    [windowId, app],
  );
  // Reload remounts the boundary and the app with fresh state.
  const [attempt, setAttempt] = useState(0);

  if (!app || !api) {
    return (
      <div role="alert" className="p-6 text-center text-sm">
        {`Unknown app "${appId ?? windowId}"`}
      </div>
    );
  }
  const App = app.component;
  return (
    <AppBoundary
      key={attempt}
      appName={app.name}
      onReload={() => setAttempt((a) => a + 1)}
    >
      <Suspense
        fallback={
          <div
            data-app-skeleton=""
            aria-busy="true"
            className="h-full w-full animate-pulse bg-white/5"
          />
        }
      >
        <App windowId={windowId} args={args} api={api} />
      </Suspense>
    </AppBoundary>
  );
}

/**
 * The `renderContent` that WindowLayer takes. Call it once at module level
 * (#66), so the function is stable and a frame does not re-render with the
 * layer.
 */
export function createRenderContent(
  lookup: AppLookup,
): (windowId: string) => ReactNode {
  return function renderContent(windowId) {
    return <AppHost windowId={windowId} lookup={lookup} />;
  };
}
