import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { MediaProvider, MediaStatus } from "@/media/provider";
import {
  useMediaAvailability,
  type MediaAvailability,
} from "./useMediaAvailability";

// The hook without a Screen: it renders no Tooltip. Promises settle in
// microtasks, so `flush` runs a few of them inside act(), where React applies
// the state they set.

const FIXTURE = (id: string) => ({
  id,
  sources: [
    { src: `https://example.test/media/${id}.webm`, type: "video/webm" },
    { src: `https://example.test/media/${id}.mp4`, type: "video/mp4" },
  ],
  poster: `https://example.test/media/${id}.jpg`,
  width: 640,
  height: 360,
  durationMs: 1000,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const flush = () =>
  act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });

function provider(
  resolve: MediaProvider["resolve"],
  status: MediaStatus = "online",
) {
  return {
    resolve: vi.fn(resolve),
    status: vi.fn<() => MediaStatus>(() => status),
  };
}

describe("useMediaAvailability", () => {
  it("is checking, then ready", async () => {
    const media = provider((id) => Promise.resolve(FIXTURE(id)));
    const { result } = renderHook(() =>
      useMediaAvailability(media, "deadknight"),
    );
    expect(result.current).toBe("checking");
    await flush();
    expect(result.current).toBe("ready");
  });

  it("still plays when the status is unknown", async () => {
    const media = provider((id) => Promise.resolve(FIXTURE(id)), "unknown");
    const { result } = renderHook(() =>
      useMediaAvailability(media, "deadknight"),
    );
    await flush();
    expect(result.current).toBe("ready");
  });

  it.each<[string, MediaProvider]>([
    ["resolve gives null", provider(() => Promise.resolve(null))],
    [
      "the status is offline",
      provider((id) => Promise.resolve(FIXTURE(id)), "offline"),
    ],
    ["resolve rejects", provider(() => Promise.reject(new Error("no")))],
    [
      "resolve throws",
      provider(() => {
        throw new Error("no");
      }),
    ],
    // A bare vi.fn() returns undefined, which is not a promise.
    [
      "resolve returns nothing",
      { resolve: vi.fn(), status: () => "online" } as unknown as MediaProvider,
    ],
    [
      "status throws",
      {
        resolve: (id) => Promise.resolve(FIXTURE(id)),
        status: () => {
          throw new Error("no");
        },
      },
    ],
  ])("is offline when %s", async (_name, media) => {
    const { result } = renderHook(() =>
      useMediaAvailability(media, "deadknight"),
    );
    expect(result.current).toBe("checking");
    await flush();
    expect(result.current).toBe("offline");
  });

  it("resolves once per provider and id", async () => {
    const media = provider((id) => Promise.resolve(FIXTURE(id)));
    const { rerender } = renderHook(
      ({ m, id }) => useMediaAvailability(m, id),
      { initialProps: { m: media as MediaProvider, id: "deadknight" } },
    );
    await flush();
    expect(media.resolve.mock.calls).toEqual([["deadknight"]]);

    // The same props again: nothing is asked.
    rerender({ m: media, id: "deadknight" });
    await flush();
    expect(media.resolve).toHaveBeenCalledTimes(1);

    // Another id asks again.
    rerender({ m: media, id: "3d-engine" });
    await flush();
    expect(media.resolve.mock.calls).toEqual([["deadknight"], ["3d-engine"]]);

    // Another provider with the same id asks that provider, once.
    const other = provider((id) => Promise.resolve(FIXTURE(id)));
    rerender({ m: other, id: "3d-engine" });
    await flush();
    expect(other.resolve.mock.calls).toEqual([["3d-engine"]]);
    expect(media.resolve).toHaveBeenCalledTimes(2);
  });

  it("resolves once under Strict Mode", async () => {
    const media = provider((id) => Promise.resolve(FIXTURE(id)));
    const { result } = renderHook(
      () => useMediaAvailability(media, "deadknight"),
      { wrapper: StrictMode },
    );
    await flush();
    expect(media.resolve).toHaveBeenCalledTimes(1);
    expect(result.current).toBe("ready");
  });

  it("ignores a late answer for another id", async () => {
    const a = deferred<ReturnType<typeof FIXTURE> | null>();
    const media = provider((id) =>
      id === "deadknight" ? a.promise : Promise.resolve(FIXTURE(id)),
    );
    const { result, rerender } = renderHook(
      ({ id }) => useMediaAvailability(media, id),
      { initialProps: { id: "deadknight" } },
    );
    await flush();
    expect(result.current).toBe("checking");

    rerender({ id: "3d-engine" });
    await flush();
    expect(result.current).toBe("ready");

    // A's null arrives now. It is for another entry.
    a.resolve(null);
    await flush();
    expect(result.current).toBe("ready");
  });

  it("ignores a late answer that would have been ready, too", async () => {
    const a = deferred<ReturnType<typeof FIXTURE> | null>();
    const media = provider((id) =>
      id === "deadknight" ? a.promise : Promise.resolve(null),
    );
    const { result, rerender } = renderHook(
      ({ id }) => useMediaAvailability(media, id),
      { initialProps: { id: "deadknight" } },
    );
    await flush();
    rerender({ id: "3d-engine" });
    await flush();
    expect(result.current).toBe("offline");

    a.resolve(FIXTURE("deadknight"));
    await flush();
    expect(result.current).toBe("offline");
  });

  it("does not show an old answer for a new id", async () => {
    const never = new Promise<null>(() => {});
    const media = provider((id) =>
      id === "deadknight" ? Promise.resolve(null) : never,
    );
    const { result, rerender } = renderHook(
      ({ id }) => useMediaAvailability(media, id),
      { initialProps: { id: "deadknight" } },
    );
    await flush();
    expect(result.current).toBe("offline");

    // In the very render that has the new id, before any effect or answer.
    const seen: MediaAvailability[] = [];
    rerender({ id: "3d-engine" });
    seen.push(result.current);
    await flush();
    seen.push(result.current);
    expect(seen).toEqual(["checking", "checking"]);
  });

  it("asks nothing after it is unmounted", async () => {
    const media = provider((id) => Promise.resolve(FIXTURE(id)));
    const { unmount } = renderHook(() =>
      useMediaAvailability(media, "deadknight"),
    );
    unmount();
    await flush();
    expect(media.resolve).not.toHaveBeenCalled();
  });
});
