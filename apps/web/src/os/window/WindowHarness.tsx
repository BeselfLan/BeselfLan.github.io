"use client";

import { Screen } from "@/os/screen/Screen";

/** Used only by the dev-only e2e route. */
export function WindowHarness() {
  return (
    <div className="fixed inset-0">
      <Screen>{null}</Screen>
    </div>
  );
}
