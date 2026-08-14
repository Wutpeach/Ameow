// CompactCatCharacter: the compact-only Flat Blob Cat SVG host. This is a
// DOM/React boundary module: it receives the existing
// Pointer Field READ-ONLY and plain projection inputs, owns no lifecycle,
// Product, native, or IPC authority, and exposes no completion callback.
//
// Living vocabulary (MR2 minimum):
//   - eye attention: pointer-driven, bounded by the pure recipe, smoothed by
//     local springs that retarget from their current value;
//   - blink: one deterministic low-duty timer + one short local Motion
//     keyframe, only while compact-mounted, document-visible, and non-reduced;
//   - tiny pointer-coupled body squash (normal motion only);
//   - no breathing, no stochastic behavior, no Character-owned rAF.
//
// Transforms use Motion's individual transform props (x/y/scale/scaleY), the
// same pipeline as `magnetic.ts`; Motion renders them as CSS transforms on the
// SVG groups with fill-box origin at the group center.
//
// Reduced Motion bypasses the springs with a frozen source so no spring frame
// work can run; the eyes follow directly at a smaller amplitude.

import { useCallback, useEffect, useRef } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import {
  CHARACTER_BODY_CENTER,
  CHARACTER_BODY_PATH,
  CHARACTER_EAR_LEFT_PATH,
  CHARACTER_EAR_RIGHT_PATH,
  CHARACTER_EYE_LEFT,
  CHARACTER_EYE_RIGHT,
  CHARACTER_EYE_RADIUS_X,
  CHARACTER_EYE_RADIUS_Y,
  CHARACTER_VIEWBOX,
  resolveCharacterAttentionTarget,
  resolveGatedSpringSource,
  type CharacterAttentionTarget,
} from "./characterRecipe";
import {
  createCharacterBlinkRuntime,
  type CharacterBlinkRuntimeHandle,
} from "./characterBlinkRuntime";

export type CompactCatCharacterProps = {
  /** Rendered edge size in CSS pixels; maps onto CHARACTER_VIEWBOX units. */
  size: number;
  bodyColor: string;
  eyeColor: string;
  reducedMotion: boolean;
  /** The sole continuous pointer authority, consumed read-only. */
  pointerField: {
    x: MotionValue<number>;
    y: MotionValue<number>;
  };
  /** Compact visual center in stable-root (viewport-local) coordinates. */
  attentionCenterX: number;
  attentionCenterY: number;
};

const CHARACTER_EYE_SPRING = { stiffness: 280, damping: 28 } as const;
const CHARACTER_BODY_SPRING = { stiffness: 320, damping: 26 } as const;
const CHARACTER_BLINK_DURATION_S = 0.16;
const CHARACTER_BLINK_CLOSED_SCALE = 0.12;

export function CompactCatCharacter({
  size,
  bodyColor,
  eyeColor,
  reducedMotion,
  pointerField,
  attentionCenterX,
  attentionCenterY,
}: CompactCatCharacterProps) {
  // Read-only attention projection: stable-root Pointer Field point ->
  // bounded SVG-space target. Springs smooth normal motion and retarget from
  // their current rendered value; Reduced Motion selects the direct targets.
  const target = useTransform(
    [pointerField.x, pointerField.y],
    ([px, py]: number[]) => resolveCharacterAttentionTarget(
      { x: px, y: py },
      { x: attentionCenterX, y: attentionCenterY },
      reducedMotion,
    ),
  );
  const targetX = useTransform(target, (t: CharacterAttentionTarget) => t.x);
  const targetY = useTransform(target, (t) => t.y);
  const targetBody = useTransform(target, (t) => t.bodyScale);

  // Stable-source attention springs. Motion 12 useSpring captures its source
  // subscription at first render (its follow effect omits the source
  // identity), so the source MotionValue must NEVER be conditionally swapped.
  // Each spring binds ONCE to a permanent gated source whose value follows the
  // live attention target while normal motion is active and holds the last
  // normal target (a constant) while Reduced Motion is active — a constant
  // source means zero spring work, so Reduced Motion leaves no decorative
  // spring tail, and the next normal flip resumes spring-follow immediately
  // from the current condition. The reduced flag is observed through a ref
  // updated synchronously during render: useTransform's combine callback runs
  // DURING render (and again on frame input changes), so only a ref write in
  // the render body — read solely by the gate transforms, never by render
  // output — can make a toggle take effect on the very render that computes
  // the targets, not one effect later. The body spring binds directly to
  // targetBody: its value is already constant under Reduced Motion.
  /* eslint-disable react-hooks/refs */
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  /* eslint-enable react-hooks/refs */

  const lastNormalXRef = useRef(0);
  const lastNormalYRef = useRef(0);
  const springSourceX = useTransform(
    targetX,
    (tx: number) => {
      const next = resolveGatedSpringSource(tx, reducedMotionRef.current, lastNormalXRef.current);
      lastNormalXRef.current = next;
      return next;
    },
  );
  const springSourceY = useTransform(
    targetY,
    (ty: number) => {
      const next = resolveGatedSpringSource(ty, reducedMotionRef.current, lastNormalYRef.current);
      lastNormalYRef.current = next;
      return next;
    },
  );
  const springX = useSpring(springSourceX, CHARACTER_EYE_SPRING);
  const springY = useSpring(springSourceY, CHARACTER_EYE_SPRING);
  const springBody = useSpring(targetBody, CHARACTER_BODY_SPRING);
  const eyeX = reducedMotion ? targetX : springX;
  const eyeY = reducedMotion ? targetY : springY;
  const bodyScale = reducedMotion ? targetBody : springBody;

  // Entering Reduced Motion settles the three hidden springs immediately via
  // the MotionValue jump API (cancels residual animation, parks the value at
  // the current authoritative target, resets velocity), so no decorative
  // spring work survives the transition. Returning to normal resumes from the
  // current condition through the gated sources above — no reset or replay.
  useEffect(() => {
    if (!reducedMotion) {
      return;
    }
    springX.jump(targetX.get());
    springY.jump(targetY.get());
    springBody.jump(targetBody.get());
  }, [reducedMotion, springBody, springX, springY, targetBody, targetX, targetY]);

  // Blink: one deterministic timer + one stoppable local keyframe on the eye
  // group's vertical scale. The timer lives in a disposable consumer-local
  // runtime; stale generations never blink or re-schedule.
  const blinkScaleY = useMotionValue(1);
  const blinkAnimationRef = useRef<{ stop: () => void } | null>(null);
  const blinkRuntimeRef = useRef<CharacterBlinkRuntimeHandle | null>(null);

  // Interruption anywhere (visibility sleep, reduced-motion flip, unmount)
  // must not leave the eyes closed: stop the keyframe and restore full-open
  // immediately. This is the ONLY place the animation is stopped outside a
  // blink's own re-target.
  const restoreBlinkOpen = useCallback(() => {
    blinkAnimationRef.current?.stop();
    blinkAnimationRef.current = null;
    blinkScaleY.set(1);
  }, [blinkScaleY]);

  useEffect(() => {
    const runtime = createCharacterBlinkRuntime({
      scheduler: {
        schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
        cancel: (handle) => window.clearTimeout(handle),
      },
      onBlink: () => {
        blinkAnimationRef.current?.stop();
        blinkAnimationRef.current = animate(blinkScaleY, [1, CHARACTER_BLINK_CLOSED_SCALE, 1], {
          duration: CHARACTER_BLINK_DURATION_S,
          times: [0, 0.45, 1],
          ease: [0.22, 1, 0.36, 1],
        });
      },
    });
    blinkRuntimeRef.current = runtime;
    // Mounting while the document is hidden (sleep) waits for visibility.
    if (!reducedMotion && !document.hidden) {
      runtime.start();
    }
    return () => {
      runtime.dispose();
      blinkRuntimeRef.current = null;
      restoreBlinkOpen();
    };
  }, [blinkScaleY, reducedMotion, restoreBlinkOpen]);

  // Document visibility acts as the Character sleep/wake boundary: hidden
  // cancels the timer and restores the eyes to full-open; visible re-arms one
  // future blink from current eligibility.
  useEffect(() => {
    const handleVisibilityChange = () => {
      const runtime = blinkRuntimeRef.current;
      if (runtime === null) {
        return;
      }
      if (document.hidden) {
        runtime.stop();
        restoreBlinkOpen();
      } else if (!reducedMotion) {
        runtime.start();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [reducedMotion, restoreBlinkOpen]);

  return (
    <svg
      viewBox={`0 0 ${CHARACTER_VIEWBOX} ${CHARACTER_VIEWBOX}`}
      width={size}
      height={size}
      aria-hidden="true"
      style={{
        display: "block",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      {/* Static pivot: centered geometry -> visual center of the 60x60 shell. */}
      <g transform={`translate(${CHARACTER_BODY_CENTER.x} ${CHARACTER_BODY_CENTER.y})`}>
        <motion.g
          style={{
            scale: bodyScale,
          }}
        >
          <path d={CHARACTER_BODY_PATH} fill={bodyColor} />
          <path d={CHARACTER_EAR_LEFT_PATH} fill={bodyColor} />
          <path d={CHARACTER_EAR_RIGHT_PATH} fill={bodyColor} />
        </motion.g>
      </g>
      <motion.g
        style={{
          x: eyeX,
          y: eyeY,
          scaleY: blinkScaleY,
          transformBox: "fill-box",
          transformOrigin: "center",
        }}
      >
        <ellipse
          cx={CHARACTER_EYE_LEFT.x}
          cy={CHARACTER_EYE_LEFT.y}
          rx={CHARACTER_EYE_RADIUS_X}
          ry={CHARACTER_EYE_RADIUS_Y}
          fill={eyeColor}
        />
        <ellipse
          cx={CHARACTER_EYE_RIGHT.x}
          cy={CHARACTER_EYE_RIGHT.y}
          rx={CHARACTER_EYE_RADIUS_X}
          ry={CHARACTER_EYE_RADIUS_Y}
          fill={eyeColor}
        />
      </motion.g>
    </svg>
  );
}
