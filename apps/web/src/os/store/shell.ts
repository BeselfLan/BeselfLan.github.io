import type { OSApi } from "./index";

export type Popover = "power" | "calendar" | null;

export interface ContextMenuState {
  x: number;
  y: number;
  // Narrowed to MenuItem[] by #10.
  items: readonly unknown[];
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
    openContextMenu(x: number, y: number, items: readonly unknown[]): void {
      api.setState((s) => {
        // Copied so immer freezes our array, not the caller's.
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
