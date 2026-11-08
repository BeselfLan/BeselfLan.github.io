import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { os } from "@/os/store";
import {
  frameOf,
  mountLayer,
  open,
  register,
  setupBrowser,
  teardownBrowser,
} from "./mountLayer";

beforeEach(() => {
  setupBrowser();
});
afterEach(teardownBrowser);

const layer = () => document.querySelector<HTMLElement>("[data-window-layer]")!;
const ids = () =>
  [...document.querySelectorAll("[data-window-id]")].map((el) =>
    el.getAttribute("data-window-id"),
  );

describe("WindowLayer", () => {
  it("renders one frame per window, minimised ones too", () => {
    register({ id: "a" }, { id: "b" }, { id: "c" });
    mountLayer();
    open("a");
    open("b");
    open("c");
    act(() => os.windows.minimizeWindow("b"));
    expect(ids()).toEqual(["a", "b", "c"]);
    expect(frameOf("b")!.isConnected).toBe(true);
  });

  it("renders no frame for a closed window", () => {
    register({ id: "a" }, { id: "b" });
    mountLayer();
    open("a");
    open("b");
    act(() => void os.windows.closeWindow("a"));
    expect(ids()).toEqual(["b"]);
  });

  it("does not block the desktop", () => {
    register({ id: "a" }, { id: "b" });
    mountLayer();
    open("a");
    open("b");
    expect(layer().classList.contains("pointer-events-none")).toBe(true);
    for (const id of ["a", "b"]) {
      expect(frameOf(id)!.classList.contains("pointer-events-auto")).toBe(true);
    }
  });

  it("keeps window z inside the layer", () => {
    register({ id: "a" }, { id: "b" });
    mountLayer();
    open("a");
    open("b");
    expect(layer().classList.contains("isolate")).toBe(true);
    for (const id of ["a", "b"]) {
      expect(frameOf(id)!.parentElement).toBe(layer());
    }
  });

  it("renders children above the frames", () => {
    register({ id: "n" }, { id: "t", alwaysOnTop: true });
    mountLayer({ children: <div data-testid="child" /> });
    open("n");
    open("t");
    const wrapper = screen.getByTestId("child").parentElement!;
    expect(layer().lastElementChild).toBe(wrapper);
    expect(wrapper.classList.contains("pointer-events-none")).toBe(true);
    for (const id of ["n", "t"]) {
      expect(Number(wrapper.style.zIndex)).toBeGreaterThan(
        Number(frameOf(id)!.style.zIndex),
      );
    }
  });

  it("adds no wrapper without children", () => {
    register({ id: "a" });
    mountLayer();
    open("a");
    expect(layer().children).toHaveLength(1);
    expect(layer().lastElementChild).toBe(frameOf("a"));
  });
});
