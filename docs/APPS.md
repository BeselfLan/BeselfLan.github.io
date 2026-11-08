# Adding an app

An app is a folder under `apps/web/src/apps/` that the OS opens in a window.
This page covers the contract, the one command that starts an app, and the
rules. The working example is the Hello app in `apps/web/src/apps/_template/`
(id `hello`), and the examples below use the invented id `terminal`. Everything
here is true of what is merged now; the few things that a later issue adds are
marked "not yet" with its number.

## 1. What an app is

- A folder `apps/web/src/apps/<id>/` with `index.ts` and a component file.
  `index.ts` holds the definition: its default export is made with `defineApp`
  from `@/os/apps/types`.
- `apps/web/src/os/apps/registry.ts` lists every app. Projects, Skills, Video
  Player, About and Hello are registered already.
- Under `npm run dev`, `/?app=hello` opens the Hello app. It shows its args and
  has one button per `AppApi` call, so it is the quickest way to see each one.

## 2. Add an app: `npm run new-app <id>`

```sh
npm run new-app terminal
```

The id is kebab-case (`terminal`, `music-player`) and stays the same for the
life of the app. The command:

- copies `apps/web/src/apps/_template/` to `apps/web/src/apps/terminal/`.
  Identifiers that start with `Template` follow the id (`TemplateApp` becomes
  `TerminalApp`, `TemplateArgs` becomes `TerminalArgs`, and the file
  `TemplateApp.tsx` becomes `TerminalApp.tsx`).
  In `index.ts` it rewrites the `const ID` line and the `name` line (the name
  is the id in Title Case: `Terminal`, `Music Player`). Everything else,
  comments and the "Hello, world" greeting included, is copied as it is.
- adds `import terminal from "@/apps/terminal";` just above the
  `// new-app: imports` line in `registry.ts`, and `terminal,` just above the
  `// new-app: entries` line. Leave both marker lines where they are.
- prints what it wrote, and nothing else changes.

It refuses, and writes nothing, for an id that is not kebab-case, a reserved
word (`class`, `type`, ...), an id or a name the registry or another app
already uses (`hello` and `projects` included), a folder that exists, a
registry without both markers, and a template that no longer matches what the
script expects. The error starts with `new-app:`.

It edits `registry.ts`, which belongs to the lead (see `docs/OWNERSHIP.json`),
so run it only in an issue that lists that file. A feature agent whose app
already exists (the folders listed in section 1) replaces the files inside its
own folder and never touches the registry.

**After it, edit `index.ts`.** The copy is a working Hello app, so these are
still Hello's values:

- `name`: set it as the dock tooltip and the window title should read.
- `window.width` and `window.height`, in screen units. The laptop work area is
  1376 x 868, starting at (64, 32).
- `dock`: `null` (not in the dock), or `{ pinned, order }`. Orders 1, 2 and 3
  belong to Projects, Skills and About.
- `showInAppGrid`: `true` lists the app in the App Grid.
- `singleton` (and `instanceKey` if it is not a singleton), `defaultArgs`,
  `deepLink` (the copy reads `name`), the component and the comments.
- The icon path is `/icons/apps/<id>.svg`. The files for it
  (`apps/web/public/icons/apps/**` in `docs/OWNERSHIP.json`) belong to
  `shell-desktop`. None exist yet and nothing renders one yet (#16), so add
  none.

Then run `npm run check`, and open `/?app=terminal` under `npm run dev`.

## 3. The definition

`AppDefinition<Args>` in `apps/web/src/os/apps/types.ts`. The values are
Hello's, from `apps/web/src/apps/_template/index.ts`.

| Field                           | Hello's value                         | Meaning                                                                                                                           |
| ------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `id`                            | `"hello"`                             | Kebab-case and stable. It is also the window id of a singleton.                                                                   |
| `name`                          | `"Hello"`                             | The dock tooltip and the default window title.                                                                                    |
| `icon`                          | `` `/icons/apps/${ID}.svg` ``         | An absolute path under `public/`.                                                                                                 |
| `window.width`, `window.height` | `480`, `360`                          | The window size in screen units. The title bar is inside it.                                                                      |
| `window.resizable`              | `false`                               | Always the literal `false` in v1.                                                                                                 |
| `window.initialPosition`        | not set                               | `"cascade"` (the default when unset), `"center"` or `{ x, y }`.                                                                   |
| `window.chrome`                 | not set                               | `"none"` drops the title bar: the app draws its own.                                                                              |
| `capabilities.minimize`         | `true`                                | Whether the title bar has a Minimise button.                                                                                      |
| `capabilities.maximize`         | `false`                               | Whether it has a Maximise button. Off in v1.                                                                                      |
| `capabilities.close`            | `true`                                | Whether it has a Close button.                                                                                                    |
| `capabilities.alwaysOnTop`      | not set                               | Copied to the window when it opens. Such a window sorts above the others.                                                         |
| `singleton`                     | `true`                                | One window for the app. `false` makes one window per `instanceKey`.                                                               |
| `instanceKey`                   | not set                               | `(args) => string`. Required when `singleton` is `false`; Video Player uses `(a) => a.projectId`.                                 |
| `dock`                          | `null`                                | `null`, or `{ pinned, order }`. Nothing renders the dock yet (#16).                                                               |
| `showInAppGrid`                 | `true`                                | Lists the app in the App Grid. The Desktop stub lists these as "Open <name>" buttons until #16.                                   |
| `component`                     | `lazy(() => import("./TemplateApp"))` | A `React.lazy` import, loaded on the first open behind a skeleton.                                                                |
| `defaultArgs`                   | `{}`                                  | What a first open without args uses.                                                                                              |
| `deepLink`                      | `parse` and `format` on `name`        | Lets `?app=<id>` open the app (section 8).                                                                                        |
| `title`                         | not set                               | `(args) => string`, for a window title that depends on the args. Without it the title is `name`.                                  |
| `menu`                          | not set                               | For a later top-bar app menu. Nothing reads it yet.                                                                               |
| `shortcuts`                     | not set                               | Nothing reads it yet. Use `api.registerShortcut` (section 5).                                                                     |
| `onBeforeClose`                 | not set                               | `(ctx) => boolean \| Promise<boolean>`. Closing awaits it. `false` keeps the window open, and a hook that throws counts as allow. |

Keep two things when you rewrite `index.ts`: the default export made with
`defineApp`, and the `id`. `registry.ts` depends on both. Everything else in
the folder is yours.

## 4. The component

```tsx
"use client";

import type { AppProps } from "@/os/apps/types";
import type { TerminalArgs } from "./index";

export default function TerminalApp({ windowId, args, api }: AppProps<TerminalArgs>) { ... }
```

- `"use client"` comes first, and the file has a default export.
- `args` comes from the store and is frozen: read it, never change it. A
  re-open with new args replaces them (no merge) and re-renders the app. A first
  open without args uses `defaultArgs`.
- Local state (`useState`) lives as long as the window: minimise keeps it,
  close drops it.
- `index.ts` must not read `window` or `document` when it is imported, because
  the page, and with it `registry.ts`, is loaded on the server during the build.
  `lazy(() => import(...))` at module level is fine. Browser APIs belong inside
  the component, in effects.

## 5. `AppApi`

`api` is bound to the app's own window. It is the only way an app reaches the
OS (section 10). The members, from `types.ts` and `appApi.ts`:

- `close()` asks `onBeforeClose`, then closes. The app unmounts after the exit
  fade, and its state is gone.
- `minimize()` hides the window and keeps the app mounted.
- `focus()` raises this window if it is open. A minimised window stays
  minimised.
- `setTitle(title)` sets the title bar text.
- `openApp(appId, args?)` opens or raises another app and returns its window
  id. It throws, before it changes anything, on an unknown id or a missing
  `instanceKey`.
- `notify({ title, body?, icon? })` adds to the OS notification list. Nothing
  displays that list yet (#16).
- `isVisible()` is true while the window is open (not minimised) and the page
  is visible.
- `subscribeVisible(cb)` calls back only when `isVisible()` changes, and
  returns the unsubscribe.
- `bounds()` is the content area in screen units: the window size minus the
  title bar (`TITLE_BAR_HEIGHT`, 40), or the work area when maximised. With
  `chrome: "none"` nothing is subtracted.
- `registerShortcut({ combo, handler, description? })` runs only while this
  window is focused and returns the unregister. `description` is unused for now.
- `content` is the `ContentProvider` (`apps/web/src/content/provider.ts`): the
  profile, entries, skills and the rest of `packages/content`, read
  synchronously.
- `media` is the `MediaProvider` (`apps/web/src/media/provider.ts`). For now it
  is a placeholder: `resolve` gives `null` and `status()` gives `"unknown"`
  (#18).

Register things that need undoing in an effect and return the undo:

```tsx
useEffect(() => api.registerShortcut({ combo: "Alt+Shift+H", handler }), [api]);
```

## 6. Windows

- A window's id is the app id for a singleton, else `${id}:${instanceKey(args)}`.
  Opening an app whose window is open raises it and restores it if it was
  minimised. Video Player opened twice for the same project is one window.
- Placement. With no `initialPosition`, a window opens 32 units right of and
  below the last window in the list, or at the work area's top left plus 32 for
  the first one and when it would not fit. `"center"` centres it, and `{ x, y }`
  is clamped into the work area.
- The size is fixed (`resizable: false`). Maximise is off in v1. On a screen
  under 900 px wide, or a touch screen held in portrait, the screen is in
  fullscreen mode, and every window opens maximised.
- The title is `title(args)` when the definition has one, else `name`.
  `api.setTitle` changes it later.

## 7. Visibility, minimise and close

- Minimise keeps the app mounted with its state, and `isVisible()` turns false
  as soon as the minimise starts. Close unmounts the app.
- Pause work while the window is hidden. In React use `useWindowVisible()` from
  `@/os/window/useWindowVisible`. For a loop outside React (an animation
  frame, a physics step) use `api.isVisible()` and `api.subscribeVisible`.
- `useWindowVisible()` throws outside a window, because the window frame
  provides the id. A test that renders an app outside the layer wraps it in
  `<WindowIdContext value={windowId}>` from the same file, as
  `apps/web/tests/unit/apps/hello.test.tsx` does.

## 8. Deep links

The rules are in `apps/web/src/os/apps/deepLink.ts`.

- `?app=<id>` opens the app with `deepLink.parse(params)` as its args. An app
  without `deepLink` cannot be opened this way. A `parse` that returns `null`,
  an unknown id, and any error are ignored silently.
- The focused window's app and `format(args)` are written back to the address
  bar with `history.replaceState`, never `pushState`. The write happens when the
  focused window or its args change, not at load. An app cannot override `app`,
  other params such as `boot` are dropped, and a `format` that throws gives the
  bare path.
- `parse` returns the args or `null`. `format` returns a record of strings, and
  must leave a param out when its arg is not set. `?app=hello&name=Ann` is the
  Hello app's link.
- `useKernel()` in `apps/web/src/os/apps/kernel.ts` does this once, from
  `page.tsx`. The app does nothing.

## 9. When an app crashes

- Each window has its own error boundary (`apps/web/src/os/apps/AppHost.tsx`).
  A crash shows "This app crashed." with a Reload button in that window only.
  Reload remounts the app with fresh state. One notification, "<Name> crashed",
  is pushed.
- While the lazy chunk loads, the window shows a skeleton
  (`data-app-skeleton`).
- A window whose app id the registry does not know shows `Unknown app "<id>"`.
- A failed `lazy` import is cached, so Reload after a chunk that did not load
  shows the crash again. That is accepted in v1.

## 10. The rules

- Only `apps/web/src/os/**` may import the store. An app reaches the OS through
  `api`. The `no-restricted-imports` rule in `apps/web/eslint.config.mjs` reports
  any `os/store` import from `src/apps/**`, and
  `apps/web/tests/unit/apps/importRule.test.ts` proves it.
- Ids are kebab-case and stable. Sizes and positions are in screen units. The
  one exception is a `Popover` anchor, which is in client px.
- The folder is self-contained: its definition, components, styles and tests
  live in it, and nothing outside it imports its internals. Another app is
  opened with `api.openApp`, not imported.

## 11. What an app may import from the OS

This is the set that Hello uses and the other apps may use:

- `@/os/apps/types`: `AppProps`, `AppDefinition`, `defineApp`.
- `@/os/ui/Button`: variants `default`, `primary` and `ghost`; `type` defaults
  to `"button"`.
- `@/os/ui/Chip`: a label. `selected` makes it a toggle, and `onClick` makes it
  a button.
- `@/os/ui/Icon`: a `src` file or inline SVG; give `label`, or it is decoration.
- `@/os/ui/Menu`: `MenuItem` and `Menu`; put the menu inside a `Popover`.
- `@/os/ui/Popover`: an anchor in client px; it renders inside the screen.
- `@/os/ui/Tooltip`: a label for one control.
- `@/os/window/useWindowVisible`.
- `@/os/screen/Screen`: `useScreen()` gives `scale`, `mode`, `workArea` and
  `toScreenPoint`.
- `@/os/apps/extensions` (section 12).

For colours, radii and shadows use the `os-*` theme tokens in
`apps/web/src/app/globals.css` (`bg-os-panel`, `text-os-panel-fg`,
`rounded-os-sm`, ...), as Hello does.

## 12. Extension points

In `apps/web/src/os/apps/extensions.ts`, so an app adds to the shell without
editing a shell component:

- `contextMenus.register(target, items)`: `target` is `"desktop"`,
  `"dock-icon"` or `"window-title"`, and `items` are `MenuItem`s. It returns the
  unregister. `list(target)` and `subscribe` are there for the shell.
- `topBar.registerTrayItem(item)`: an `{ id, label, order?, render }`. It throws
  on a duplicate id and returns the unregister. `listTrayItems()` and
  `subscribe` are there for the shell.
- `notifications.push({ title, body?, icon? })` returns the id. Call it from an
  event or an effect, not during render.
- `shortcuts.register(scope, combo, handler)` is re-exported from
  `apps/web/src/os/input/shortcuts.ts`. An app uses `api.registerShortcut`.

Register in an effect and return the unregister. Nothing renders context menus
or tray items yet (#15, #16), so registering is safe and shows nothing.

Keys. The handlers are installed only while the desktop shows. The focused
window's handlers run first, then global ones, then the defaults: Alt+F4 closes
the focused window, a tap on Super toggles Activities, Alt+Tab and
Alt+Shift+Tab cycle focus, and Escape closes Activities, the open popover
and the context menu. A plain key
typed into a text field is left to the field. A combo is modifiers (`Ctrl`,
`Alt`, `Shift`, `Meta`) plus one key, joined by `+`, and `register` throws on a
bad one.

## 13. Testing an app

- Unit tests go next to the code, in the app's folder, as `*.test.ts(x)`:
  `apps/web/vitest.config.mts` includes `src/**/*.test.{ts,tsx}`, and
  `apps/web/tests/unit/**` belongs to the lead. Render the component directly
  with a fake `api` made of `vi.fn()`s, as `hello.test.tsx` does.
- The e2e spec is `apps/web/tests/e2e/<area>.spec.ts`. Open the app with
  `/?app=<id>`, not with the Desktop stub's "Open <name>" buttons, which #16
  replaces. The specs fail on any console error. Use your own port, because
  other sessions share the host: `PORT=<port> npm run test:e2e -w apps/web --
<spec>` (`apps/web/playwright.config.ts` reads `PORT`).
- Finish with `npm run check`.

## 14. Checklist

1. `npm run new-app <id>`, in an issue that lists `registry.ts`.
2. In `index.ts`: `name`, `window` size, `dock`, `showInAppGrid`, `singleton`
   and `instanceKey`, `defaultArgs`, `deepLink`.
3. Replace the component. Keep `"use client"`, the default export and the
   `defineApp` default export in `index.ts`.
4. Reach the OS only through `api` and the imports in section 11.
5. Read nothing from `window` or `document` at import.
6. Pause on `useWindowVisible()` or `api.isVisible()`.
7. Write unit tests in the folder and an e2e spec that opens `/?app=<id>`.
8. `npm run check`.
