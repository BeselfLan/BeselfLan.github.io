import { useEffect, type ReactNode } from "react";
import { act, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mountLayer,
  open,
  ptr,
  register,
  setupBrowser,
  teardownBrowser,
  titleBarOf,
} from "./mountLayer";

// In its own file because it replaces TitleBar with a counting copy. Vitest
// mocks by resolved file, so the frame's "./TitleBar" import gets it too.
const titleBarRenders = vi.hoisted(() => new Map<string, number>());
vi.mock("@/os/window/TitleBar", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/os/window/TitleBar")>();
  return {
    ...real,
    TitleBar(props: Parameters<typeof real.TitleBar>[0]) {
      titleBarRenders.set(
        props.title,
        (titleBarRenders.get(props.title) ?? 0) + 1,
      );
      return <real.TitleBar {...props} />;
    },
  };
});

const probeRenders = new Map<string, number>();
let contentCalls = 0;

function Probe({ id }: { id: string }) {
  // After every commit of this component, which is one per render.
  useEffect(() => {
    probeRenders.set(id, (probeRenders.get(id) ?? 0) + 1);
  });
  return null;
}
// Module level, so its identity is stable.
const renderContent = (id: string): ReactNode => {
  contentCalls++;
  return <Probe id={id} />;
};

let frames: ReturnType<typeof setupBrowser>["frames"];

beforeEach(() => {
  ({ frames } = setupBrowser());
  titleBarRenders.clear();
  probeRenders.clear();
  contentCalls = 0;
});
afterEach(teardownBrowser);

const bar = (id: string) => titleBarOf(id)!;
const barRenders = (id: string) => titleBarRenders.get(id) ?? 0;

function twoWindows() {
  register({ id: "a" }, { id: "b", at: { x: 400, y: 250 } });
  mountLayer({ renderContent });
  open("a");
  open("b");
}

function dragB() {
  fireEvent.pointerDown(bar("b"), ptr());
  for (const x of [320, 380]) {
    fireEvent.pointerMove(bar("b"), ptr({ clientX: x }));
    act(() => frames.run());
  }
  fireEvent.pointerUp(bar("b"), ptr({ clientX: 380 }));
}

describe("what re-renders", () => {
  it("a drag re-renders only the dragged window", () => {
    twoWindows();
    const before = { a: barRenders("a"), b: barRenders("b") };
    dragB();
    expect(barRenders("b")).toBeGreaterThan(before.b);
    expect(barRenders("a")).toBe(before.a);
  });

  it("a drag does not re-render the app", () => {
    twoWindows();
    const probes = new Map(probeRenders);
    const calls = contentCalls;
    expect(probes.size).toBe(2);
    dragB();
    expect(probeRenders).toEqual(probes);
    expect(contentCalls).toBe(calls);
  });

  it("opening one window does not re-render the others", () => {
    register({ id: "a" }, { id: "b" }, { id: "c" });
    mountLayer({ renderContent });
    open("a");
    open("b");
    const a = barRenders("a");
    const probeA = probeRenders.get("a");
    open("c");
    expect(barRenders("c")).toBeGreaterThan(0);
    expect(barRenders("a")).toBe(a);
    expect(probeRenders.get("a")).toBe(probeA);
  });
});
