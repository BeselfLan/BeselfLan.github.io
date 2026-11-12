"use client";

import type { Entry } from "@beself/content";
import { motion, useReducedMotionConfig } from "motion/react";
import { useId } from "react";
import type { AppApi } from "@/os/apps/types";
import { Button } from "@/os/ui/Button";
import { Chip } from "@/os/ui/Chip";
import { Icon } from "@/os/ui/Icon";
import { Tooltip } from "@/os/ui/Tooltip";
import { entryLinks, KIND_LABELS, PANEL_WIDTH, periodLabel } from "./detail";
import { EntryIcon } from "./EntryIcon";
import { useMediaAvailability } from "./useMediaAvailability";

// The detail panel of one entry (plan 5.4, D22): the icon, the title, the kind
// and the years, the org and role, the summary, the tech chips (each opens
// Skills at that skill), the bullets, the links and Play. It is a sibling of
// the ring's stage in `ProjectsApp`, never inside it, and it carries none of
// the ring's markers (`data-entry-id`, `data-selected`, `data-front`).
//
// It does not use `useScreen()`. Play's `Tooltip` is always there, and outside a
// `Screen` it renders only its control and never shows (#145), so no test needs
// a Screen just for Play. It reaches the OS through `api` only: Play opens the
// video window with a plain args object, because an app never imports another
// app's folder (plan 3.4).
//
// Each link ends in hidden text, "(opens in a new tab)", because it opens one
// (WCAG G201). The visible text does not change. The space before it is in the
// link, outside the span, because a name computed from the span's own leading
// space runs the two words together.

export interface DetailPanelProps {
  /** The aside's id; the ring's items point at it with aria-controls. */
  id: string;
  entry: Entry;
  api: Pick<AppApi, "content" | "media" | "openApp">;
  onClose(): void;
}

// Whole literal strings, so Tailwind finds every class.
const PANEL =
  "absolute inset-y-0 left-0 z-10 flex max-w-full flex-col border-r border-white/10 bg-os-panel text-os-panel-fg shadow-os-popover";
const GROUP_TITLE = "text-xs font-semibold tracking-wide uppercase opacity-70";
const LINK =
  "text-os-accent underline underline-offset-2 outline-offset-2 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-os-accent";

export function DetailPanel({ id, entry, api, onClose }: DetailPanelProps) {
  const reduced = useReducedMotionConfig() ?? false;
  const headingId = useId();
  const techId = useId();
  const linksId = useId();

  const years = periodLabel(entry.period);
  const whoAndWhere = [entry.role, entry.org].filter(Boolean).join(" · ");
  const links = entryLinks(entry.links);
  const video = entry.media?.video;

  return (
    // The panel slides in when it mounts and goes at once when it closes:
    // motion's exit runs on real frames, which a test cannot step. One
    // element for every entry, so a new selection updates it in place.
    <motion.aside
      id={id}
      aria-labelledby={headingId}
      data-detail-panel=""
      className={PANEL}
      style={{ width: PANEL_WIDTH }}
      initial={reduced ? false : { x: -PANEL_WIDTH }}
      animate={{ x: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      <div className="flex shrink-0 justify-end p-2">
        <Button variant="ghost" aria-label="Close details" onClick={onClose}>
          <Icon>
            <path d="M18 6 6 18M6 6l12 12" />
          </Icon>
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pb-5">
        <div>
          <EntryIcon entry={entry} size={128} />
        </div>
        <h3
          id={headingId}
          className="text-lg leading-tight font-semibold break-words"
        >
          {entry.title}
        </h3>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Chip>{KIND_LABELS[entry.kind]}</Chip>
          {years !== null && <span className="opacity-70">{years}</span>}
        </div>

        {whoAndWhere !== "" && (
          <p className="text-sm break-words opacity-80">{whoAndWhere}</p>
        )}
        <p className="text-sm break-words">{entry.summary}</p>

        {entry.tech.length > 0 && (
          <div className="flex flex-col gap-2">
            <h4 id={techId} className={GROUP_TITLE}>
              Built with
            </h4>
            <div
              role="group"
              aria-labelledby={techId}
              className="flex flex-wrap gap-2"
            >
              {entry.tech.map((skillId) => (
                <Chip
                  key={skillId}
                  onClick={() => api.openApp("skills", { item: skillId })}
                >
                  {api.content.skill(skillId)?.name ?? skillId}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {entry.bullets.length > 0 && (
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            {entry.bullets.map((bullet, i) => (
              // Static text that never reorders, so the index is a stable key.
              <li key={i} className="break-words">
                {bullet}
              </li>
            ))}
          </ul>
        )}

        {links.length > 0 && (
          <div className="flex flex-col gap-2">
            <h4 id={linksId} className={GROUP_TITLE}>
              Links
            </h4>
            <div
              role="group"
              aria-labelledby={linksId}
              className="flex flex-wrap gap-x-4 gap-y-1 text-sm"
            >
              {links.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={LINK}
                >
                  {link.label}{" "}
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {video !== undefined && (
          <PlayDemo api={api} entry={entry} video={video} />
        )}
      </div>
    </motion.aside>
  );
}

/**
 * Play, for an entry that has a video (D11, D14). It lives in its own
 * component so that the hook asks the provider only for entries with a video.
 * Play works while the provider is still being asked: the player has its own
 * loading and error states, and the API may take a while. It is
 * `aria-disabled`, with "Demo offline" in its tooltip, only once the provider
 * says it cannot give the video. `aria-disabled` and not `disabled`, so the
 * keyboard can reach it and hear why (#147).
 *
 * It is one `Button` in one `Tooltip` for every state, and the tooltip is
 * switched off while Play works. The element never changes, so focus stays on
 * it when the answer arrives. `data-media` shows what the hook knows, for tests.
 */
function PlayDemo({
  api,
  entry,
  video,
}: {
  api: DetailPanelProps["api"];
  entry: Entry;
  video: string;
}) {
  const state = useMediaAvailability(api.media, video);
  return (
    <div className="pt-1">
      <Tooltip label="Demo offline" disabled={state !== "offline"}>
        <Button
          variant="primary"
          data-media={state}
          aria-disabled={state === "offline" ? true : undefined}
          onClick={() =>
            api.openApp("video-player", {
              projectId: entry.id,
              title: entry.title,
            })
          }
        >
          Play demo
        </Button>
      </Tooltip>
    </div>
  );
}
