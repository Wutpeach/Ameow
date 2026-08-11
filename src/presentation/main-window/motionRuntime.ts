import {
  useMotionTemplate,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useRef } from "react";
import {
  resolveMainWindowEdgeGlowPoint,
  type ResolveMainWindowEdgeGlowPointOptions,
} from "../../utils/mainWindowEdgeGlowPosition";

// Deliberately temporary, minimal continuous-value adapter for the existing
// Edge Glow compatibility consumer. This is NOT the Pointer Field architecture
// (deferred to M2): it exposes only the values current behavior already needs
// and adds no provider, events, or speculative state.
export type EdgeGlowPointerRuntime = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  lastKnownScreenPointRef: { current: { x: number; y: number } | null };
};

export const EDGE_GLOW_RADIUS = 248;
export const EDGE_GLOW_BORDER_WIDTH = 2.2;
export const EDGE_GLOW_TRIGGER_DISTANCE = 126;
export const EDGE_GLOW_FALLOFF_EXPONENT = 0.58;
export const EDGE_GLOW_MAX_OPACITY = 1.18;
export const DRAG_GLOW_BORDER_WIDTH = 2.4;

export const useEdgeGlowPointerRuntime = (): EdgeGlowPointerRuntime => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const lastKnownScreenPointRef = useRef<{ x: number; y: number } | null>(null);
  return { x, y, lastKnownScreenPointRef };
};

export const updateEdgeGlowFromClientPoint = (
  runtime: EdgeGlowPointerRuntime,
  clientX: number,
  clientY: number,
  rect: { left: number; top: number },
): void => {
  runtime.x.set(clientX - rect.left);
  runtime.y.set(clientY - rect.top);
};

export const updateEdgeGlowFromScreenPoint = (
  runtime: EdgeGlowPointerRuntime,
  options: ResolveMainWindowEdgeGlowPointOptions,
): void => {
  const point = resolveMainWindowEdgeGlowPoint(options);
  if (!point) {
    return;
  }
  runtime.x.set(point.x);
  runtime.y.set(point.y);
};

export const resolveEdgeGlowOpacity = (
  x: number,
  y: number,
  fullSize: number,
): number => {
  const distanceToEdge = Math.min(x, y, fullSize - x, fullSize - y);
  const normalized = Math.max(0, 1 - distanceToEdge / EDGE_GLOW_TRIGGER_DISTANCE);
  return Math.min(1, Math.pow(normalized, EDGE_GLOW_FALLOFF_EXPONENT) * EDGE_GLOW_MAX_OPACITY);
};

export const useEdgeGlowOpacity = (
  runtime: EdgeGlowPointerRuntime,
  fullSize: number,
): MotionValue<number> => useTransform(
  [runtime.x, runtime.y],
  ([xValue, yValue]: number[]) => resolveEdgeGlowOpacity(xValue, yValue, fullSize),
);

export const useEdgeGlowBackground = (
  runtime: EdgeGlowPointerRuntime,
): MotionValue<string> => useMotionTemplate`
  radial-gradient(
    ${EDGE_GLOW_RADIUS}px circle at ${runtime.x}px ${runtime.y}px,
    rgba(59,130,246,1) 0%,
    rgba(96,165,250,0.98) 18%,
    rgba(125,211,252,0.72) 38%,
    rgba(147,197,253,0.36) 56%,
    rgba(191,219,254,0.14) 70%,
    transparent 84%
  )
`;
