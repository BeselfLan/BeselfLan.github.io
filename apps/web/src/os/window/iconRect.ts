/** A client-px rect. A DOMRect fits, and so does a plain object. */
export type IconRect = Pick<
  DOMRectReadOnly,
  "left" | "top" | "width" | "height"
>;

/** Returns the dock icon of an app in client px, or null when it has none. */
export type IconRectGetter = (appId: string) => IconRect | null;

let current: IconRectGetter | null = null;

/**
 * The caller registers one getter, and a minimising window flies to the rect
 * it returns. A later registration replaces the earlier one. The returned
 * unregister clears the getter only if it is still the current one, so
 * Strict Mode's register, unregister, register ends registered.
 */
export function registerIconRectGetter(getter: IconRectGetter): () => void {
  current = getter;
  return () => {
    if (current === getter) current = null;
  };
}

/** Null with no getter, when the getter has no rect, and when it throws. */
export function getIconRect(appId: string): IconRect | null {
  if (!current) return null;
  try {
    return current(appId);
  } catch {
    return null;
  }
}
