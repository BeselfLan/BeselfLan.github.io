import type { MenuItem } from "../ui/Menu";
import type { OSApi } from "./index";

export type Popover = "power" | "calendar" | null;

export interface ContextMenuState {
  /** Client px from the pointer event (plan 3.4): Popover converts them itself. */
  x: number;
  /** Client px, as `x`. */
  y: number;
  items: readonly MenuItem[];
}

export interface ShellState {
  activitiesOpen: boolean;
  openPopover: Popover;
  contextMenu: ContextMenuState | null;
  altTabIndex: number;
}

export const initialShell: ShellState = {
  activitiesOpen: false,
  openPopover: null,
  contextMenu: null,
  altTabIndex: 0,
};

export function createShellActions(api: OSApi) {
  return {
    setActivitiesOpen(open: boolean): void {
      api.setState((s) => {
        s.shell.activitiesOpen = open;
      });
    },
    toggleActivities(): void {
      api.setState((s) => {
        s.shell.activitiesOpen = !s.shell.activitiesOpen;
      });
    },
    setPopover(p: Popover): void {
      api.setState((s) => {
        s.shell.openPopover = p;
      });
    },
    /** `x` and `y` are client px. Callers must not mutate `items` afterwards. */
    openContextMenu(x: number, y: number, items: readonly MenuItem[]): void {
      api.setState((s) => {
        // The array is copied, but immer still deep-freezes the item objects
        // the caller passed in, so callers must not mutate them afterwards.
        s.shell.contextMenu = { x, y, items: [...items] };
      });
    },
    closeContextMenu(): void {
      api.setState((s) => {
        s.shell.contextMenu = null;
      });
    },
    setAltTabIndex(i: number): void {
      api.setState((s) => {
        s.shell.altTabIndex = i;
      });
    },
    /** Esc: closes Activities, the popover and the context menu. Leaves altTabIndex. */
    closeAll(): void {
      api.setState((s) => {
        s.shell.activitiesOpen = false;
        s.shell.openPopover = null;
        s.shell.contextMenu = null;
      });
    },
  };
}
