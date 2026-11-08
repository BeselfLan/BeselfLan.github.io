"use client";

import { useScreen } from "../screen/Screen";
import { os, useOS } from "../store";
import { Menu } from "../ui/Menu";
import { Popover } from "../ui/Popover";

// Module level, so the Popover's listener effect keeps one subscription.
const closeMenu = () => os.shell.closeContextMenu();

/**
 * Renders `shell.contextMenu`: whoever opens one calls
 * `os.shell.openContextMenu(clientX, clientY, items)` and this draws it. The
 * dock's menu and the desktop's menu share it. The menu state lives in the
 * store, so the global Esc (`closeAll`) closes it too.
 *
 * `place()` clamps a box inside the screen but never flips it, so a menu
 * opened in the lower half would cover the icon it came from. It opens
 * upwards there, and downwards in the upper half.
 */
export function ContextMenuHost() {
  const menu = useOS((s) => s.shell.contextMenu);
  const { toScreenPoint, portalTarget } = useScreen();
  if (menu === null) return null;

  const y = toScreenPoint(menu.x, menu.y).y;
  const lower = portalTarget !== null && y > portalTarget.offsetHeight / 2;

  return (
    <Popover
      open
      role="presentation"
      anchor={{ left: menu.x, top: menu.y, width: 0, height: 0 }}
      align="start"
      side={lower ? "top" : "bottom"}
      onClose={closeMenu}
    >
      <Menu items={menu.items} onClose={closeMenu} aria-label="Context menu" />
    </Popover>
  );
}
