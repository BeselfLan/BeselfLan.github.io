"use client";

import { useEffect, useState } from "react";
import type { AppProps } from "@/os/apps/types";
import { Button } from "@/os/ui/Button";
import { useWindowVisible } from "@/os/window/useWindowVisible";
import type { TemplateArgs } from "./index";

// The example app (plan 2.4). It shows its args and makes every AppApi call
// once, each behind a button named after the call. docs/APPS.md points here.
//
// The rules an app follows (plan 3.4):
// - Reach the OS only through `api`. Importing the store from src/apps/** is a
//   lint error. `@/os/ui/*` and `useWindowVisible` are the other OS imports an
//   app may use.
// - `args` is frozen. Read it, never change it.
// - Everything this folder needs lives in this folder.

/** The key this window listens for while it is focused. */
const SHORTCUT = "Alt+Shift+H";

function Readout({
  id,
  label,
  value,
}: {
  id: string;
  label: string;
  value: string;
}) {
  return (
    <>
      <dt className="opacity-70">{label}</dt>
      <dd data-readout={id}>{value}</dd>
    </>
  );
}

// `windowId` is in the props too. An app rarely needs it, because `api` is
// already bound to this window.
export default function TemplateApp({ args, api }: AppProps<TemplateArgs>) {
  // Local state lives as long as the window does. Minimising keeps it, closing
  // drops it.
  const [pressed, setPressed] = useState(0);
  const [title, setTitle] = useState("Renamed");

  // Two ways to follow visibility. `useWindowVisible()` is the React way. The
  // AppApi way (isVisible and subscribeVisible) suits a loop outside React,
  // such as a physics step that pauses while the window is minimised.
  const hookVisible = useWindowVisible();
  const [visible, setVisible] = useState(() => api.isVisible());
  useEffect(() => api.subscribeVisible(setVisible), [api]);

  // Shortcuts fire only while this window is focused. registerShortcut returns
  // the unregister, so the effect hands it back as its cleanup.
  const [presses, setPresses] = useState(0);
  useEffect(
    () =>
      api.registerShortcut({
        combo: SHORTCUT,
        handler: () => setPresses((n) => n + 1),
        description: "Count a shortcut press",
      }),
    [api],
  );

  const bounds = api.bounds();

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-4 text-sm text-os-panel-fg">
      <h2 className="text-lg font-semibold">
        {`Hello, ${args.name ?? "world"}`}
      </h2>
      <pre className="rounded-os-sm bg-black/30 p-2 text-xs">
        {JSON.stringify(args)}
      </pre>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => setPressed((n) => n + 1)}>
          {`Pressed ${pressed}`}
        </Button>
        {/* The labels name the call, because the title bar's own buttons are
            "Close" and "Minimise". */}
        <Button onClick={() => api.close()}>api.close()</Button>
        <Button onClick={() => api.minimize()}>api.minimize()</Button>
        <Button onClick={() => api.focus()}>api.focus()</Button>
        <Button onClick={() => api.openApp("about")}>
          {'api.openApp("about")'}
        </Button>
        <Button onClick={() => api.notify({ title: "Hello from Hello" })}>
          api.notify()
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-os-sm bg-white/10 px-2 py-1"
          />
        </label>
        <Button onClick={() => api.setTitle(title)}>api.setTitle()</Button>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <Readout
          id="bounds"
          label="api.bounds()"
          value={`${bounds.width} x ${bounds.height}`}
        />
        <Readout
          id="visible"
          label="api.isVisible()"
          value={visible ? "visible" : "hidden"}
        />
        <Readout
          id="hook"
          label="useWindowVisible()"
          value={hookVisible ? "visible" : "hidden"}
        />
        <Readout
          id="profile"
          label="api.content.profile().name"
          value={api.content.profile().name}
        />
        <Readout
          id="media"
          label="api.media.status()"
          value={api.media.status()}
        />
        <Readout
          id="shortcut"
          label={`${SHORTCUT} presses`}
          value={String(presses)}
        />
      </dl>
    </div>
  );
}
