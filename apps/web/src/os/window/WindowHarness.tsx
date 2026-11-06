"use client";

import { useEffect } from "react";
import { Screen } from "@/os/screen/Screen";
import { os, useOS } from "@/os/store";
import type { WindowApp } from "@/os/store/windows";
import { useDrag } from "./useDrag";

const app: WindowApp = {
  id: "harness",
  name: "Harness",
  window: {
    width: 400,
    height: 300,
    initialPosition: { x: 200, y: 100 },
  },
  capabilities: { maximize: false },
  singleton: true,
};

function Box() {
  const win = useOS((s) => s.windows.items.find((w) => w.id === "harness"));
  const { dragging, handleProps } = useDrag("harness");
  if (!win) return null;
  return (
    <div
      data-testid="harness-window"
      className="absolute top-0 left-0 bg-white"
      style={{
        width: win.size.width,
        height: win.size.height,
        transform: `translate3d(${win.position.x}px, ${win.position.y}px, 0)`,
        willChange: dragging ? "transform" : undefined,
      }}
    >
      <div
        data-testid="harness-handle"
        className="h-10 bg-gray-300"
        {...handleProps}
      />
    </div>
  );
}

/** Used only by the dev-only e2e route. */
export function WindowHarness() {
  // A plain effect: it must run after Screen's layout effects. A singleton
  // makes the second run under Strict Mode harmless.
  useEffect(() => {
    os.windows.setAppLookup(() => app);
    os.windows.openApp("harness");
  }, []);
  return (
    <div className="fixed inset-0">
      <Screen>
        <Box />
      </Screen>
    </div>
  );
}
