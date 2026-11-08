import { lazy } from "react";
import { defineApp } from "@/os/apps/types";
import { isFilterId, type FilterId } from "./filters";

// The Projects definition (plan 5.1). It keeps the default export made with
// defineApp and the id "projects", because os/apps/registry.ts depends on both.
// registry.ts imports this file into the page's first chunk, so it imports
// only react, the app contract and the type-only filters: the component stays
// lazy, and the content package stays out.
//
// The deep link (D16) carries both args: `?app=projects&item=<id>` opens the
// panel of that entry, and `&filter=<chip>` starts on that chip. `parse` drops
// what does not validate and never returns null, and `format` never throws:
// a throw would fall back to the bare path and hide the bug.

/**
 * `item` is an entry id to open in the panel; `filter` is the chip to start on.
 * `viewFor` (filters.ts) turns them into the starting view.
 */
export interface ProjectsArgs {
  item?: string;
  filter?: FilterId;
}

// The id pattern of `IdSchema` in packages/content/src/schema.ts, repeated so
// that the content package stays out of the first chunk. The length limit
// keeps an absurd link from reaching the content lookup.
const ITEM_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_ITEM = 64;

export default defineApp<ProjectsArgs>({
  id: "projects",
  name: "Projects",
  icon: "/icons/apps/projects.svg",
  window: { width: 1040, height: 640, resizable: false },
  capabilities: { minimize: true, maximize: false, close: true },
  singleton: true,
  dock: { pinned: true, order: 1 },
  showInAppGrid: true,
  defaultArgs: {},
  component: lazy(() => import("./ProjectsApp")),
  deepLink: {
    parse: (params) => {
      const args: ProjectsArgs = {};
      const item = params.get("item");
      if (item && item.length <= MAX_ITEM && ITEM_ID.test(item)) {
        args.item = item;
      }
      const filter = params.get("filter");
      if (isFilterId(filter)) args.filter = filter;
      return args;
    },
    format: ({ item, filter }): Record<string, string> => {
      const params: Record<string, string> = {};
      if (item) params.item = item;
      if (filter) params.filter = filter;
      return params;
    },
  },
});
