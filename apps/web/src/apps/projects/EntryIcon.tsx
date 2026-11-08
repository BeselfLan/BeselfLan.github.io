import { Icon } from "@/os/ui/Icon";
import {
  hasDrawnIcon,
  tileColour,
  tileInitials,
  type EntryIconSource,
} from "./entryIcon";

/**
 * The picture of an entry: its drawn SVG, or for an entry without one a tile
 * of its initials on a colour from its id (plan 5.7). Both are decoration, as
 * the button or the heading beside them names the entry. `size` is in screen
 * units; #18's panel uses 128.
 *
 * Only a drawn icon is ever a file, so nothing here can ask for a missing one.
 * The colour and the size are inline styles, because Tailwind never generates
 * a class that is put together at runtime.
 */
export function EntryIcon({
  entry,
  size = 96,
}: {
  entry: EntryIconSource;
  size?: number;
}) {
  if (hasDrawnIcon(entry)) {
    return <Icon src={entry.icon} size={size} className="shrink-0" />;
  }
  return (
    <span
      data-icon-tile=""
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center font-semibold text-white select-none"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.21),
        backgroundColor: tileColour(entry.id),
        fontSize: Math.round(size * 0.4),
        lineHeight: 1,
      }}
    >
      {tileInitials(entry.title)}
    </span>
  );
}
