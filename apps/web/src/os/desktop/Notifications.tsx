"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useOS } from "../store";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { createToastQueue } from "./toasts";

// The toasts (plan 4.6, #101): every notification pushed after this mounts
// shows at the top centre for 4 s, at most three, newest first. The region is
// always rendered, so a screen reader registers the live region before
// anything is announced in it. A toast never takes focus: the App Grid gives
// focus back on close, and a toast must not move a keyboard user's place.
//
// The timing is `toasts.ts`'s. A toast that times out or is hidden stays in the
// calendar's list; an item removed from the store takes its toast with it. The
// toast does not draw the notification's icon, so nothing here loads a file.

// Whole literal strings, so Tailwind finds every class. The section lets the
// pointer through, and each toast takes it back.
const REGION =
  "pointer-events-none absolute inset-x-0 top-12 flex flex-col items-center gap-2 px-4";
const TOAST =
  "pointer-events-auto flex w-full max-w-96 items-start gap-2 rounded-os-md bg-os-panel/95 p-3 text-os-panel-fg shadow-os-popover";

export function Notifications() {
  // The ids already in the store are marked seen, so they never toast. A read
  // of the store in an initialiser, not a subscription.
  const [queue] = useState(() =>
    createToastQueue(useOS.getState().notifications.items.map((n) => n.id)),
  );
  useEffect(() => queue.start(), [queue]);
  const toasts = useSyncExternalStore(queue.subscribe, queue.get, queue.get);

  const reducedSetting = useOS((s) => s.settings.reducedMotion);
  const systemReduced = useReducedMotion();
  const reduced =
    reducedSetting === "on" || (reducedSetting === "system" && !!systemReduced);

  return (
    <section
      data-toasts=""
      aria-label="New notifications"
      aria-live="polite"
      className={REGION}
    >
      {toasts.map((t) => (
        // No exit animation: a toast leaves the DOM when its time ends.
        <motion.div
          key={t.id}
          data-toast={t.id}
          className={TOAST}
          initial={reduced ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t.title}</p>
            {t.body && <p className="text-sm text-os-panel-fg/80">{t.body}</p>}
          </div>
          <Button
            variant="ghost"
            aria-label={`Hide ${t.title}`}
            className="px-2"
            onClick={() => queue.hide(t.id)}
          >
            <Icon>
              <path d="M18 6L6 18M6 6l12 12" />
            </Icon>
          </Button>
        </motion.div>
      ))}
    </section>
  );
}
