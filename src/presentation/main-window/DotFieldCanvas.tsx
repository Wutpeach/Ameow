import { useEffect, useRef, useState } from "react";
import {
  resolveBoundedDpr,
  resolveDotFieldDprMediaQuery,
  type DotFieldBaseline,
  type DotFieldIntentKind,
  type DotOrigin,
} from "./dotFieldRecipe";
import {
  createDotFieldRuntime,
  type DotFieldRuntimeHandle,
} from "./dotFieldRuntime";
import type { DotDrawSurface } from "./dotFieldRuntime";

export type DotFieldCanvasProps = {
  /** Content-surface logical size in CSS pixels. */
  size: number;
  eligible: boolean;
  reducedMotion: boolean;
  dormantColor: string;
  ackColor: string;
  /** Latest discrete local intent; keyed so repeated intents re-trigger. */
  intent: { key: number; kind: DotFieldIntentKind; origin: DotOrigin } | null;
};

const createCanvasDrawSurface = (
  context: CanvasRenderingContext2D,
  getViewport: () => { size: number; dpr: number },
): DotDrawSurface => ({
  clear: () => {
    const { size, dpr } = getViewport();
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, size, size);
  },
  drawDot: (x, y, radius, color) => {
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  },
});

/**
 * Dot Field canvas host. The surface publishes coarse baseline/eligibility/
 * intent inputs only; per-frame geometry stays inside the local runtime.
 * The canvas is a non-interactive decorative background layer.
 */
export function DotFieldCanvas({
  size,
  eligible,
  reducedMotion,
  dormantColor,
  ackColor,
  intent,
}: DotFieldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<DotFieldRuntimeHandle | null>(null);
  const viewportRef = useRef({ size: 0, dpr: 1 });
  const consumedIntentKeyRef = useRef(-1);
  // Bumped by the resolution media query when the OS monitor scale changes;
  // the baseline effect re-reads the dpr and revises the backing store.
  const [dprEpoch, setDprEpoch] = useState(0);

  // One runtime per canvas lifetime; unmount permanently disposes it.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    const context = canvas.getContext("2d");
    if (context === null) {
      return;
    }
    const runtime = createDotFieldRuntime({
      now: () => performance.now(),
      scheduleFrame: (callback) => requestAnimationFrame(callback),
      cancelFrame: (handle) => cancelAnimationFrame(handle),
      draw: createCanvasDrawSurface(context, () => viewportRef.current),
    });
    runtimeRef.current = runtime;
    return () => {
      runtime.dispose();
      runtimeRef.current = null;
    };
  }, []);

  // Baseline + eligibility: publish coarse inputs; wake/sleep by projection.
  // `dprEpoch` is a dependency so a monitor scale change re-runs this effect:
  // the backing store and dormant baseline are revised against the NEW dpr
  // (settled state redraws once at the new scale; a mid-transient applies on
  // the next frame). The listener below re-arms against the revised dpr, so
  // one scale change causes exactly one revision — no revision loop.
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime === null) {
      return;
    }
    const dpr = resolveBoundedDpr(window.devicePixelRatio);
    const backingSize = Math.round(size * dpr);
    const canvas = canvasRef.current;
    if (canvas !== null && (canvas.width !== backingSize || canvas.height !== backingSize)) {
      canvas.width = backingSize;
      canvas.height = backingSize;
    }
    viewportRef.current = { size, dpr };
    const baseline: DotFieldBaseline = {
      size,
      dormant: dormantColor,
      ack: ackColor,
      reducedMotion,
    };
    runtime.setBaseline(baseline);
    if (eligible) {
      runtime.wake(baseline);
    } else {
      runtime.sleep();
    }
  }, [size, eligible, reducedMotion, dormantColor, ackColor, dprEpoch]);

  // Live DPR revision: the resolution media query for the CURRENT bounded dpr
  // fires `change` when the OS display scale crosses it (Windows scaling,
  // dragging between mixed-scale monitors). Re-arming on every bump against
  // the new dpr makes the cycle self-terminating. Fallback when the browser
  // never fires `change` (unsupported/rare): the next eligibility flip
  // (collapse/expand) re-reads the dpr anyway.
  useEffect(() => {
    const media = window.matchMedia(
      resolveDotFieldDprMediaQuery(window.devicePixelRatio),
    );
    const handleDprChange = () => setDprEpoch((epoch) => epoch + 1);
    media.addEventListener("change", handleDprChange);
    return () => media.removeEventListener("change", handleDprChange);
  }, [dprEpoch]);

  // Discrete intents are consumed exactly once; nothing replays after sleep.
  useEffect(() => {
    if (intent === null || intent.key === consumedIntentKeyRef.current) {
      return;
    }
    consumedIntentKeyRef.current = intent.key;
    runtimeRef.current?.submitIntent({ kind: intent.kind, origin: intent.origin });
  }, [intent]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        width: size,
        height: size,
        pointerEvents: "none",
      }}
    />
  );
}
