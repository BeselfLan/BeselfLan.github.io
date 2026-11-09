"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ResolvedMedia } from "@/media/provider";
import type { AppProps } from "@/os/apps/types";
import { Button } from "@/os/ui/Button";
import type { VideoPlayerArgs } from "./index";

// The demo window (plan 5.5, D13, D14). `data-video-state` says which of five
// states it is in:
//   none     the entry has no video (or there is no such entry);
//   loading  api.media.resolve() for the entry's media id is pending;
//   offline  the resolve gave null or failed: "Demo offline" and Retry;
//   ready    a <video> with the resolved sources, in manifest order;
//   error    the <video> or its last source failed: Retry.
// The state is derived in render from the entry, the latest answer and the
// attempt that failed. setState runs only in promise callbacks and event
// handlers, so the react-hooks lint rule has nothing to flag.
//
// The effects are keyed on the media id and the attempt, never on `args`. A
// second Play for the same demo makes the store replace `args` with a new
// object, and only the window should come forward: an effect keyed on `args`
// would resolve again and restart the video.
//
// No autoplay, and no keys: the native controls own them, and Escape belongs
// to the App Grid. The player ignores the provider's status(): a resolved
// entry plays, because Play in Projects is the gate (plan 5.4).

interface Answer {
  mediaId: string;
  attempt: number;
  media: ResolvedMedia | null;
}

type State = "none" | "loading" | "offline" | "error" | "ready";

// What stopDownload took off each <source>, so that a remount can put it back.
const stopped = new WeakMap<HTMLSourceElement, string>();

/**
 * Pauses the element and aborts its download: emptying the sources and
 * calling load() is the standard way to do that. The order matters, because
 * load() restarts the resource selection from whatever the sources hold.
 */
function stopDownload(el: HTMLVideoElement) {
  el.pause();
  for (const source of el.querySelectorAll("source")) {
    const src = source.getAttribute("src");
    if (src !== null) stopped.set(source, src);
    source.removeAttribute("src");
  }
  el.removeAttribute("src");
  el.load();
}

/**
 * Undoes stopDownload on an element that is still in use. Only Strict Mode
 * needs it: in development React 19 runs a ref callback's setup, its cleanup
 * and its setup again on mount, and the cleanup must not leave the new
 * video without sources. A real mount has nothing stopped, so it does nothing.
 */
function resumeDownload(el: HTMLVideoElement) {
  let restored = false;
  for (const source of el.querySelectorAll("source")) {
    const src = stopped.get(source);
    if (src === undefined) continue;
    stopped.delete(source);
    source.setAttribute("src", src);
    restored = true;
  }
  if (restored) el.load();
}

export default function VideoPlayerApp({
  args,
  api,
}: AppProps<VideoPlayerArgs>) {
  // `projectId` is the entry's id; the video's own id comes through the entry
  // (fnaf-project has the video "fnaf").
  const entry = api.content.entry(args.projectId);
  const mediaId = entry?.media?.video;
  const name = entry?.title ?? args.title ?? args.projectId;

  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  // The attempt whose video failed.
  const [failed, setFailed] = useState<number | null>(null);
  const { media: provider } = api;

  // The answer is stored with the (media id, attempt) it was made for and
  // shown only to that pair, so a stale answer is never shown: after Retry the
  // view says "loading" until the new attempt answers. The call happens one
  // microtask late and only while the effect is live. So a provider that throws
  // or returns something that is not a promise gives "offline" instead of
  // crashing, and Strict Mode's mount, unmount and mount resolves once.
  useEffect(() => {
    if (mediaId === undefined) return;
    let live = true;
    Promise.resolve()
      .then(() => (live ? provider.resolve(mediaId) : null))
      .catch(() => null)
      .then((found) => {
        if (live) setAnswer({ mediaId, attempt, media: found ?? null });
      });
    return () => {
      live = false;
    };
  }, [provider, mediaId, attempt]);

  const current =
    answer !== null && answer.mediaId === mediaId && answer.attempt === attempt
      ? answer
      : null;
  const media = current?.media ?? null;
  const state: State =
    mediaId === undefined
      ? "none"
      : current === null
        ? "loading"
        : media === null
          ? "offline"
          : failed === attempt
            ? "error"
            : "ready";

  // The ref callback is stable (an inline one is called again on every render,
  // which would pause and empty the video on any state change). Its cleanup
  // runs when the element goes: the window closes, Retry remounts it, or the
  // state leaves "ready".
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bindVideo = useCallback((el: HTMLVideoElement | null) => {
    if (!el) return;
    videoRef.current = el;
    resumeDownload(el);
    return () => {
      if (videoRef.current === el) videoRef.current = null;
      stopDownload(el);
    };
  }, []);

  // Hidden pauses the video and nothing resumes it: the visitor presses play.
  useEffect(
    () =>
      api.subscribeVisible((visible) => {
        if (!visible) videoRef.current?.pause();
      }),
    [api],
  );

  const retry = () => setAttempt((a) => a + 1);
  const fail = () => setFailed(attempt);

  return (
    <div
      data-video-state={state}
      className="relative flex h-full flex-col items-center justify-center gap-3 bg-black text-os-panel-fg"
    >
      <h2 className="sr-only">{`Video Player: ${name}`}</h2>
      {state === "none" && <p>This project has no demo.</p>}
      {state === "loading" && (
        <div
          aria-busy="true"
          className="flex h-full w-full items-center justify-center"
        >
          <p>Loading the demo...</p>
        </div>
      )}
      {state === "offline" && (
        <>
          <p aria-live="polite">Demo offline</p>
          <Button onClick={retry}>Retry</Button>
        </>
      )}
      {state === "error" && (
        <>
          <p aria-live="polite">This demo could not load.</p>
          <Button onClick={retry}>Retry</Button>
        </>
      )}
      {state === "ready" && media !== null && (
        <video
          key={attempt}
          ref={bindVideo}
          aria-label={`Demo: ${name}`}
          controls
          playsInline
          preload="metadata"
          poster={media.poster}
          className="h-full w-full bg-black object-contain"
          // React passes a <source>'s error up to the <video>: a failed first
          // source (a WebM that Safari cannot play) must not count, because
          // the next source is still being tried. Only the video's own error
          // and the last source's error do.
          onError={(e) => {
            if (e.target === e.currentTarget) fail();
          }}
        >
          {media.sources.map((s, i) => (
            <source
              key={s.src}
              src={s.src}
              type={s.type}
              onError={i === media.sources.length - 1 ? fail : undefined}
            />
          ))}
        </video>
      )}
    </div>
  );
}
