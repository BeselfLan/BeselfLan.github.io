/** True for the main button of the primary pointer. */
export function isPrimaryPress(e: {
  button: number;
  isPrimary: boolean;
}): boolean {
  return e.button === 0 && e.isPrimary;
}

export interface FrameThrottle<T> {
  (value: T): void;
  /** Runs the pending call now. Does nothing when none is pending. */
  flush(): void;
  /** Drops the pending call. Does nothing when none is pending. */
  cancel(): void;
}

/** Runs `run` at most once per animation frame, with the latest value. */
export function frameThrottle<T>(run: (value: T) => void): FrameThrottle<T> {
  let frame: number | null = null;
  let latest: T;
  const throttled = ((value: T) => {
    latest = value;
    if (frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      run(latest);
    });
  }) as FrameThrottle<T>;
  throttled.flush = () => {
    if (frame === null) return;
    cancelAnimationFrame(frame);
    frame = null;
    run(latest);
  };
  throttled.cancel = () => {
    if (frame === null) return;
    cancelAnimationFrame(frame);
    frame = null;
  };
  return throttled;
}
