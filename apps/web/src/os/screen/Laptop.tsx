"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import "../boot/laptop.css";
import { laptopPose, OPEN_POSE } from "../boot/laptopPose";
import { useOS } from "../store";
import { bootContext } from "../store/boot";
import { useScreenMode } from "./Screen";

// The laptop (plan 3.1, #75): a dark desk, seen from above, with a closed lid
// that opens over the `lid-opening` stage while the camera pushes in and
// levels off. `children` is the Screen, and it keeps a real size in the bezel.
//
// - The tree is the same in both modes. Fullscreen (D4) only changes
//   attributes, styles and `hidden`, so `Screen` and `BootSequence`'s stage
//   clock are never remounted by a resize or a rotation.
// - The pose comes from the boot stage (`laptopPose`), not from an animation
//   callback, so the lid never sets React state from outside `act`. #14 extends
//   that table: closing the lid at a shutdown, reduced motion, a pulled-back
//   shot with a power button.
// - Settled means flat. Once the lid is open there is no perspective, no
//   `preserve-3d` and no transform on the camera or the lid, because
//   `Screen.toScreenPoint` reads the box's rect and a 3D context blurs text.
// - `initial={false}` draws the pose from the first render, on the server too,
//   so the server HTML is the closed laptop, and a remount at a later stage
//   starts in that stage's pose.

// Wide enough that the look does not change with the viewport size.
const PERSPECTIVE = "180vmin";

const PRESERVE_3D = { transformStyle: "preserve-3d" } as const;

export function Laptop({ children }: { children: ReactNode }) {
  const fullscreen = useScreenMode() === "fullscreen";
  const stage = useOS((s) => s.boot.stage);
  // An object selector needs useShallow under zustand 5.
  const ctx = useOS(useShallow((s) => bootContext(s)));

  const pose = fullscreen ? OPEN_POSE : laptopPose(stage, ctx);
  const flat = pose.state === "open";

  return (
    <div
      data-laptop=""
      data-lid={pose.state}
      data-mode={fullscreen ? "fullscreen" : "laptop"}
      className="boot-laptop absolute inset-0 overflow-hidden"
      style={flat ? undefined : { perspective: PERSPECTIVE }}
    >
      <motion.div
        data-laptop-camera=""
        className="boot-laptop-camera"
        initial={false}
        animate={pose.camera}
        transition={pose.transition}
        style={flat ? undefined : PRESERVE_3D}
      >
        <div
          data-laptop-deck=""
          aria-hidden="true"
          className="boot-laptop-deck"
          hidden={flat}
        />
        <motion.div
          data-laptop-lid=""
          className="boot-laptop-lid"
          initial={false}
          animate={pose.lid}
          transition={pose.transition}
          style={flat ? undefined : PRESERVE_3D}
        >
          <div
            data-laptop-lid-back=""
            aria-hidden="true"
            className="boot-laptop-lid-back"
            hidden={flat}
          >
            <span className="boot-laptop-wordmark">beself</span>
          </div>
          <div
            data-laptop-bezel=""
            className="boot-laptop-bezel"
            style={{ padding: fullscreen ? 0 : "var(--boot-laptop-bezel)" }}
          >
            <span
              data-laptop-webcam=""
              aria-hidden="true"
              className="boot-laptop-webcam"
              hidden={fullscreen}
            />
            <div data-laptop-screen="" className="boot-laptop-screen">
              {children}
            </div>
          </div>
        </motion.div>
        <div
          data-laptop-lip=""
          aria-hidden="true"
          className="boot-laptop-lip"
          hidden={fullscreen}
        />
      </motion.div>
    </div>
  );
}
