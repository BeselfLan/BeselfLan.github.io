import { lazy } from "react";
import { defineApp } from "@/os/apps/types";
import { isTabId, type TabId } from "./tabs";

// The Skills definition (plan 6.1). It keeps the values of the placeholder,
// the default export made with defineApp and the id "skills", because
// os/apps/registry.ts depends on both. registry.ts imports this file into the
// page's first chunk, so it imports only react, the app contract and the
// type-only tabs: the component stays lazy, and the content package and the
// pointer maths stay out.
//
// The deep link (D16) carries both args: `?app=skills&item=<id>` opens the
// panel of that skill, and `&tab=<tab>` starts on that tab. `parse` drops what
// does not validate and never returns null, and `format` never throws: a throw
// would fall back to the bare path and hide the bug. Neither function adds a
// key the link did not carry. The lead's page.test.tsx expects
// `/?app=skills&item=python` to arrive as exactly `{ item: "python" }` and to
// keep that URL, and deepLink.test.ts expects `format({})` to be `{}`: a
// default `tab` written here would break both.

/**
 * `item` is the skill whose panel opens; `tab` is the tab to start on.
 * `viewFor` (tabs.ts) turns them into the starting view.
 */
export interface SkillsArgs {
  item?: string;
  tab?: TabId;
}

// The id pattern of `IdSchema` in packages/content/src/schema.ts, repeated so
// that the content package stays out of the first chunk. The length limit
// keeps an absurd link from reaching the content lookup.
const ITEM_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_ITEM = 64;

export default defineApp<SkillsArgs>({
  id: "skills",
  name: "Skills",
  icon: "/icons/apps/skills.svg",
  window: { width: 1000, height: 620, resizable: false },
  capabilities: { minimize: true, maximize: false, close: true },
  singleton: true,
  dock: { pinned: true, order: 2 },
  showInAppGrid: true,
  defaultArgs: {},
  component: lazy(() => import("./SkillsApp")),
  deepLink: {
    parse: (params) => {
      const args: SkillsArgs = {};
      const item = params.get("item");
      if (item && item.length <= MAX_ITEM && ITEM_ID.test(item)) {
        args.item = item;
      }
      const tab = params.get("tab");
      if (isTabId(tab)) args.tab = tab;
      return args;
    },
    format: ({ item, tab }): Record<string, string> => {
      const params: Record<string, string> = {};
      if (item) params.item = item;
      if (tab) params.tab = tab;
      return params;
    },
  },
});
