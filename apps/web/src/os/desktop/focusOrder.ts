"use client";

import { useEffect, useRef, type RefObject } from "react";
import { focusedWindow, orderedWindows, os, useOS } from "../store";

// The keyboard order of the desktop (plan 4.8, #102): Tab walks the top bar,
// then the dock, then the open windows from the highest z to the lowest, then
// the toasts, and wraps at both ends. While the App Grid is open, Tab stays
// inside it.
//
// The paint layers stay where they are (#77): the windows come before the bar
// in the DOM, so the bar paints above them, and a positive tabindex on the bar
// would leak into every app. So the browser's own order is wrong, and one
// keydown listener on `document` does the moving. It focuses a control with
// focus() and prevents the browser's Tab only once a control took the focus.
//
// Module state, because two helpers share it and only one desktop is mounted:
//  - `order`, the window order, a snapshot of the open windows' ids by z. Tabbing
//    into a window raises it, which changes the z order; recomputing it on every
//    Tab would bounce between two windows for ever. So the snapshot is kept
//    while focus stays where this file put it, and dropped when it leaves the
//    windows or the set of open windows changes.
//  - `moved`, the control this file last focused.
//  - `memory`, per window frame, the control that last had focus inside it,
//    which Alt+Tab returns to (focusInto).
//  - `walking`, the media element whose native controls the browser is walking.
//
// Native media controls are the exception to "this file does the moving". A
// <video controls> keeps its play button, scrubber, full screen and menu in a
// closed shadow root. The page sees only the <video> as the active element,
// however deep in the controls the focus is, and it sees no focusin while focus
// moves among them. It sees no keydown or keyup there either: only the Tab that
// starts on the <video> itself. So that Tab is left to the browser, which walks
// the controls, and `walking` is kept until something shows that focus is out.
// What leaves them is one focusin, on the next element in document order and
// with the <video> as its relatedTarget; the walk resumes from there, from the
// <video>, to the next control in the desktop's order. A pointer press or any
// key the document sees ends `walking`: focus is then not in the controls, or
// a mouse click, not Tab, is what moves it.
//
// Focus also follows the window (useFocusFollowsWindow, #146). When a window
// becomes the focused one because it was opened, restored or chosen, focus
// moves into it with focusInto; when the one that held focus closes or is
// minimised, focus goes to the next window, or to its dock icon when none is
// left. It never follows a press inside a window, which the browser handles,
// and it never takes focus from the dock or the top bar. It runs in a passive
// effect, so the App Grid's and the popovers' "give focus back" cleanups, which
// React runs first in the same commit, cannot win.
let order: string[] | null = null;
let moved: Element | null = null;
let memory = new WeakMap<Element, HTMLElement>();
let walking: { media: Element; dir: 1 | -1 } | null = null;

// Whole literal selector: the media elements whose controls the browser draws.
const NATIVE_MEDIA = "video[controls], audio[controls]";

// Whole literal selector. What can take focus; isControl() then drops what
// cannot. `[tabindex]` includes the roving items of the Projects ring.
const CONTROLS =
  'a[href], area[href], button, input, select, textarea, summary, iframe, audio[controls], video[controls], [contenteditable]:not([contenteditable="false"]), [tabindex]';

/**
 * Whether Tab can land on it, judged from attributes and the store and never
 * from layout, which jsdom does not have. A box that is not drawn gets past
 * this filter; the caller then notices that focus() did nothing and tries the
 * next control.
 */
function isControl(el: HTMLElement): boolean {
  if (el.hasAttribute("tabindex") && el.tabIndex < 0) return false;
  if (el.matches(":disabled")) return false;
  if (el instanceof HTMLInputElement && el.type === "hidden") return false;
  return el.closest("[inert], [hidden]") === null;
}

const controlsIn = (scope: Element): HTMLElement[] =>
  [...scope.querySelectorAll<HTMLElement>(CONTROLS)].filter(isControl);

const frameOf = (root: ParentNode, id: string): HTMLElement | null =>
  [...root.querySelectorAll<HTMLElement>("[data-window-id]")].find(
    (f) => f.getAttribute("data-window-id") === id,
  ) ?? null;

interface Group {
  /** The window's id, for a window group. */
  windowId?: string;
  el: Element;
  controls: HTMLElement[];
}

/** The ids of the open windows, in paint order from the top. */
function openIds(): string[] {
  return orderedWindows(useOS.getState())
    .filter((w) => w.status === "open")
    .reverse()
    .map((w) => w.id);
}

const sameIds = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id) => b.includes(id));

/**
 * The window order for this Tab: the kept snapshot, while focus is still on the
 * control this file focused and the same windows are open, else a new one.
 */
function windowOrder(active: Element | null): string[] {
  const now = openIds();
  if (order !== null && active === moved && sameIds(order, now)) return order;
  order = now;
  return order;
}

/** The groups the walk visits, empty ones left out. */
function groupsOf(root: HTMLElement, active: Element | null): Group[] {
  const groups: Group[] = [];
  const add = (el: Element | null, windowId?: string) => {
    if (!el) return;
    const controls = controlsIn(el);
    if (controls.length > 0) groups.push({ windowId, el, controls });
  };
  if (useOS.getState().shell.activitiesOpen) {
    add(root.querySelector("[data-app-grid]"));
    return groups;
  }
  add(root.querySelector("[data-topbar]"));
  add(root.querySelector("[data-dock]"));
  for (const id of windowOrder(active)) add(frameOf(root, id), id);
  add(root.querySelector("[data-toasts]"));
  return groups;
}

/** Focuses the first candidate that takes it. Returns it, or null. */
function focusFirst(candidates: Iterable<HTMLElement>): HTMLElement | null {
  for (const el of candidates) {
    el.focus();
    if (document.activeElement === el) return el;
  }
  return null;
}

/** `list` from `start` for one lap, in the direction given. */
function* lap<T>(list: readonly T[], start: number, dir: 1 | -1): Generator<T> {
  const n = list.length;
  for (let i = 0; i < n; i++) yield list[(((start + i * dir) % n) + n) % n];
}

// Node.DOCUMENT_POSITION_FOLLOWING and _PRECEDING, as numbers: the server build
// imports this file, and `Node` does not exist there.
const FOLLOWING = 4;
const PRECEDING = 2;

/**
 * Moves focus one step. Where it starts depends on where the focus is:
 *  - Inside a group (even on something that is not a control, such as a roving
 *    item with tabindex -1): the next control of that group after it in the
 *    document, else the first control of the next group; Shift+Tab mirrors it.
 *  - Anywhere else (the body, or a minimised window): the first control of the
 *    walk, or the last one with Shift.
 */
function step(root: HTMLElement, active: Element | null, dir: 1 | -1): boolean {
  const groups = groupsOf(root, active);
  const flat = groups.flatMap((g) => g.controls);
  if (flat.length === 0) return false;

  const at = active ? groups.findIndex((g) => g.el.contains(active)) : -1;
  let start: number;
  if (at < 0 || !active) {
    start = dir === 1 ? 0 : flat.length - 1;
  } else {
    const before = groups
      .slice(0, at)
      .reduce((n, g) => n + g.controls.length, 0);
    const mine = groups[at].controls;
    if (dir === 1) {
      const i = mine.findIndex(
        (c) => active.compareDocumentPosition(c) & FOLLOWING,
      );
      start = before + (i < 0 ? mine.length : i);
    } else {
      const i = mine.findLastIndex(
        (c) => active.compareDocumentPosition(c) & PRECEDING,
      );
      start = before + (i < 0 ? -1 : i);
    }
  }

  const landed = focusFirst(lap(flat, start, dir));
  if (!landed) return false;
  moved = landed;
  const group = groups.find((g) => g.controls.includes(landed));
  if (group?.windowId !== undefined) {
    // A control in a window raises it, so what is focused is on top.
    os.windows.focusWindow(group.windowId);
  } else {
    order = null;
  }
  return true;
}

/**
 * Plain Tab and Shift+Tab walk the desktop in plan 4.8's order. Call it from
 * the desktop with a ref to its root. It handles a Tab whose target is the body
 * or inside the root, and leaves the rest to the browser: a key with Ctrl, Alt
 * or Meta, one that something already handled, one inside the screen's portal
 * (menus and popovers handle their own Tab), and one outside the desktop.
 */
export function useFocusOrder(rootRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // A key the document sees means focus is not inside native controls.
      walking = null;
      if (e.key !== "Tab" || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.defaultPrevented || e.isComposing) return;
      const root = rootRef.current;
      const target = e.target;
      if (!root || !(target instanceof Element)) return;
      const outside =
        target !== document.body &&
        target !== document.documentElement &&
        !root.contains(target);
      if (outside || target.closest("[data-screen-portal]")) return;

      // The focused element, not the target: a key sent to the body has no
      // other place to start from.
      const active = document.activeElement;
      const from =
        active === null ||
        active === document.body ||
        active === document.documentElement
          ? null
          : active;
      const dir = e.shiftKey ? -1 : 1;
      if (from?.matches(NATIVE_MEDIA)) {
        // The browser walks the native controls: see the top of the file.
        walking = { media: from, dir };
        return;
      }
      if (step(root, from, dir)) e.preventDefault();
    };

    // Ends a walk through native media controls, and remembers the control that
    // last had focus in each window.
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const pending = walking;
      if (pending && e.relatedTarget === pending.media) {
        // Focus left the controls for the next element in document order. Take
        // it on to the next one in the desktop's order; the control that step()
        // focuses is remembered by the focusin it fires.
        walking = null;
        const desktop = rootRef.current;
        if (desktop && step(desktop, pending.media, pending.dir)) return;
      }
      const frame = target.closest("[data-window-id]");
      const root = rootRef.current;
      if (frame && root?.contains(frame)) memory.set(frame, target);
    };

    // A click on something else moves focus without Tab.
    const onPointerDown = () => {
      walking = null;
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("pointerdown", onPointerDown, true);
      walking = null;
      order = null;
      moved = null;
      memory = new WeakMap();
    };
  }, [rootRef]);
}

/**
 * Moves keyboard focus into a window once the store has made it the focused
 * one (Alt+Tab calls this after its commit). Without it, DOM focus would stay
 * in the previous window: the next Tab would walk that window and raise it back
 * over the one just chosen, and typing would go to a window that is behind.
 *
 * In order: do nothing if focus is already inside; else the control that last
 * had focus there, if it still counts as one; else the window's first control;
 * and if none takes focus while focus sits in another window, blur it.
 */
export function focusInto(windowId: string): void {
  order = null;
  moved = null;
  const frame = frameOf(document, windowId);
  if (!frame) return;
  const active = document.activeElement;
  if (active && frame.contains(active)) return;

  const remembered = memory.get(frame);
  if (
    remembered &&
    remembered.isConnected &&
    frame.contains(remembered) &&
    isControl(remembered)
  ) {
    remembered.focus();
    if (document.activeElement === remembered) return;
  }
  if (focusFirst(controlsIn(frame))) return;

  blurStale();
}

/** Blurs focus that sits inside a window frame, and leaves any other alone. */
function blurStale(): void {
  const stale = document.activeElement;
  if (stale instanceof HTMLElement && stale.closest("[data-window-id]")) {
    stale.blur();
  }
}

const isBody = (el: Element | null): boolean =>
  el === null || el === document.body || el === document.documentElement;

/**
 * Whether focus is lost: on the page (null, the body or the root), inside an
 * inert subtree (a closing window's frame is inert while it fades, and a
 * browser may or may not have moved focus out of it yet), or inside a frame
 * whose window is no longer open (closed, or minimised).
 */
function focusLost(): boolean {
  const active = document.activeElement;
  if (isBody(active) || !active) return true;
  if (active.closest("[inert]")) return true;
  const frame = active.closest("[data-window-id]");
  if (!frame) return false;
  const id = frame.getAttribute("data-window-id");
  return !useOS
    .getState()
    .windows.items.some((w) => w.id === id && w.status === "open");
}

/**
 * Keeps keyboard focus with the window the visitor chose (plan 4.8, #146).
 * Desktop calls it once. When the focused window becomes W:
 *  1. Focus already inside W's frame: nothing. This comes before focusInto,
 *     which resets the Tab walk's window snapshot, and the walk would bounce.
 *     It covers the walk's own raise and Alt+Tab.
 *  2. W is the window under the last press: nothing. A press inside a window
 *     leaves focus to the browser.
 *  3. The previous focused window is still open, or there was none: W was
 *     chosen (opened, restored, from the dock, the grid, a link, another app or
 *     Alt+Tab), so focusInto(W).
 *  4. The previous one is gone (closed or minimised): focusInto(W) only if
 *     focus is lost with it. Focus on the dock or the bar stays there.
 * With no window left, focus that is lost goes to the dock icon of the app that
 * was focused, after a key; after a press it is only blurred, because the
 * dock's tooltip opens on any focus that is not a press's. On mount, a focused
 * window (a deep link opened it first) takes focus from the body.
 *
 * Refs and focus() only, and a passive effect: see the top of the file.
 */
export function useFocusFollowsWindow(): void {
  const id = useOS((s) => focusedWindow(s)?.id ?? null);
  // The window under the last press, or null after a key and before any input.
  const press = useRef<{ windowId: string | null } | null>(null);
  // The previous focused window and its app, or undefined before the first run.
  const prev = useRef<{ id: string | null; appId: string | null } | undefined>(
    undefined,
  );

  useEffect(() => {
    // Capture phase on the document: it runs before the frame's own capture
    // handler raises the window, so the record is ready when the store changes.
    const onPress = (e: PointerEvent) => {
      const target = e.target;
      const frame =
        target instanceof Element && target.closest("[data-window-id]");
      press.current = {
        windowId: frame ? frame.getAttribute("data-window-id") : null,
      };
    };
    const onKey = () => {
      press.current = null;
    };
    document.addEventListener("pointerdown", onPress, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPress, true);
      document.removeEventListener("keydown", onKey, true);
      press.current = null;
    };
  }, []);

  useEffect(() => {
    const before = prev.current;
    const win =
      id === null
        ? undefined
        : useOS.getState().windows.items.find((w) => w.id === id);
    prev.current = { id, appId: win?.appId ?? null };

    // Strict Mode runs the effect twice on mount.
    if (before !== undefined && before.id === id) return;

    // The mount: a deep link opened its window before the desktop was there.
    if (before === undefined) {
      if (id !== null && isBody(document.activeElement)) focusInto(id);
      return;
    }

    // No window is left.
    if (id === null) {
      if (before.id !== null && focusLost()) {
        const icon =
          press.current === null && before.appId !== null
            ? document.querySelector<HTMLElement>(
                `[data-dock-app="${before.appId}"]`,
              )
            : null;
        icon?.focus();
        if (!icon || document.activeElement !== icon) blurStale();
      }
      return;
    }

    // Rule 1, before focusInto: see above.
    const frame = frameOf(document, id);
    const active = document.activeElement;
    if (frame && active && frame.contains(active)) return;
    // Rule 2.
    if (press.current?.windowId === id) return;
    // Rule 3, then rule 4.
    const previousOpen =
      before.id === null ||
      useOS
        .getState()
        .windows.items.some((w) => w.id === before.id && w.status === "open");
    if (previousOpen || focusLost()) focusInto(id);
  }, [id]);
}
