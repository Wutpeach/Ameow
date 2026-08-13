// Dot Field recipe: pure, deterministic, hard-bounded presentation policy for
// the Expanded Window dot grid. This module is a renderer-local leaf: it has
// no imports, reads no coordinates/DOM/native state, and exposes only pure
// functions plus constants. All geometry is CSS pixels of the stable square
// content surface; the runtime and the surface own scheduling and wiring.

export const DOT_GRID_STEP = 14;
export const DOT_RADIUS = 1.6;
/** Total dot population hard bound for any surface size. */
export const DOT_COUNT_MAX = 400;
/** Backing-store scale cap so the canvas never exceeds 2x device pixels. */
export const DOT_DPR_MAX = 2;
/** Normalized band from the surface edge where dormant dots attenuate. */
export const DOT_EDGE_FADE = 0.2;
/** Soft radial response radius in CSS pixels. */
export const DOT_RESPONSE_RADIUS = 44;
/** Softness of the travelling front envelope (px): the exponential skirt
    ahead of the front and the afterglow ridge behind it share one width. */
export const DOT_RESPONSE_SOFTNESS = 16;
export const DOT_TRANSIENT_DURATION_MS = 480;
export const DOT_REDUCED_MOTION_DURATION_MS = 90;

export type DotOrigin = Readonly<{ u: number; v: number }>;

export type DotFieldIntentKind = "click" | "context";

export type DotFieldIntent = Readonly<{
  kind: DotFieldIntentKind;
  origin: DotOrigin;
}>;

export type DotFieldBaseline = Readonly<{
  size: number;
  dormant: string;
  ack: string;
  reducedMotion: boolean;
}>;

export type DotGridPoint = Readonly<{ x: number; y: number; u: number; v: number }>;

export type DotFieldGrid = Readonly<{ points: readonly DotGridPoint[]; step: number }>;

/** Content-surface rect in client (viewport) coordinates. */
export type DotContentRect = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);

/** Deterministic centered square grid; population is hard-bounded. */
export const resolveDotFieldGrid = (size: number): DotFieldGrid => {
  const step = DOT_GRID_STEP;
  if (!Number.isFinite(size) || size <= 0) {
    return { points: [], step };
  }
  const rawAxisCount = Math.floor(size / step) + 1;
  const axisCount = Math.min(rawAxisCount, Math.floor(Math.sqrt(DOT_COUNT_MAX)));
  const points: DotGridPoint[] = [];
  for (let row = 0; row < axisCount; row += 1) {
    for (let col = 0; col < axisCount; col += 1) {
      const x = ((col + 0.5) / axisCount) * size;
      const y = ((row + 0.5) / axisCount) * size;
      points.push({ x, y, u: x / size, v: y / size });
    }
  }
  return { points, step };
};

/** Soft boundary attenuation: 1 in the interior, 0 at the outer edge band. */
export const resolveDotEdgeFactor = (u: number, v: number): number => {
  if (!Number.isFinite(u) || !Number.isFinite(v)) {
    return 0;
  }
  const margin = Math.min(u, v, 1 - u, 1 - v);
  return clamp01(margin / DOT_EDGE_FADE);
};

/** Soft radial response magnitude at one dot for an intent origin; bounded 0..1. */
export const resolveDotResponseStrength = (
  dot: DotGridPoint,
  origin: DotOrigin,
  size: number,
): number => {
  if (
    !Number.isFinite(dot.x)
    || !Number.isFinite(dot.y)
    || !Number.isFinite(origin.u)
    || !Number.isFinite(origin.v)
    || !Number.isFinite(size)
    || size <= 0
  ) {
    return 0;
  }
  const dx = dot.x - origin.u * size;
  const dy = dot.y - origin.v * size;
  const radius = DOT_RESPONSE_RADIUS;
  const distanceSquared = dx * dx + dy * dy;
  return Math.exp(-distanceSquared / (2 * radius * radius));
};

/** Quadratic ease-out decay over the transient duration; exactly 0 at/after completion. */
export const resolveDotResponseCurve = (
  elapsedMs: number,
  durationMs: number,
): number => {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(durationMs) || durationMs <= 0) {
    return 0;
  }
  const progress = clamp01(elapsedMs / durationMs);
  return (1 - progress) * (1 - progress);
};

/**
 * Spatial-temporal response envelope. Normal motion: a soft propagation front
 * — a gentle brightness wave travelling outward from the intent origin. The
 * front radius grows linearly over the transient duration; brightness peaks
 * AT the front and falls off exponentially on both sides (a soft skirt ahead
 * for gentle fade-in, an afterglow ridge behind). The envelope never
 * hard-cuts (no radar ring), so a retarget that collapses the old transient
 * into the new peaks stays smooth. Boundary absorption is the caller's
 * edge-factor alpha; this envelope only shapes how far and how fast
 * brightness travels, and it reaches the response radius exactly when the
 * transient duration ends. Reduced motion does NOT travel: the envelope is
 * the constant 1, leaving a non-travelling localized bloom shaped only by
 * the seeded strength and the decay curve.
 */
export const resolveDotResponseFront = (
  distance: number,
  elapsedMs: number,
  durationMs: number,
  reducedMotion: boolean,
): number => {
  if (
    !Number.isFinite(distance)
    || distance < 0
    || !Number.isFinite(elapsedMs)
    || !Number.isFinite(durationMs)
    || durationMs <= 0
  ) {
    return 0;
  }
  if (reducedMotion) {
    return 1;
  }
  const progress = clamp01(elapsedMs / durationMs);
  const frontRadius = DOT_RESPONSE_RADIUS * progress;
  return Math.exp(-Math.abs(distance - frontRadius) / DOT_RESPONSE_SOFTNESS);
};

export const resolveDotTransientDuration = (reducedMotion: boolean): number => (
  reducedMotion ? DOT_REDUCED_MOTION_DURATION_MS : DOT_TRANSIENT_DURATION_MS
);

/** Bounded device-pixel-ratio for the canvas backing store. */
export const resolveBoundedDpr = (rawDpr: number): number => {
  if (!Number.isFinite(rawDpr) || rawDpr <= 0) {
    return 1;
  }
  return Math.min(rawDpr, DOT_DPR_MAX);
};

/**
 * Media query that watches the CURRENT RAW display resolution. The browser
 * fires `change` when the device pixel ratio crosses this value (monitor
 * scale change, drag between monitors), which drives live backing
 * store/baseline revision. The query must use the RAW finite positive
 * devicePixelRatio — NOT the bounded backing cap — because a capped query
 * silently misses transitions that never equal the cap: for 3dppx -> 1.5dppx
 * the capped query `(resolution: 2dppx)` matches at neither resolution and
 * no `change` ever fires, while the raw query `(resolution: 3dppx)` matches
 * at 3, stops matching at 1.5, and fires. The BACKING STORE stays capped at
 * 2x by `resolveBoundedDpr` at the canvas; this query only watches the
 * display. Invalid values (non-finite, non-positive) safely fall back to
 * 1dppx. The listener re-arms against the revised dpr, so the cycle
 * terminates after one revision per scale change (no loop, no polling).
 */
export const resolveDotFieldDprMediaQuery = (rawDpr: number): string => {
  const watchDpr = Number.isFinite(rawDpr) && rawDpr > 0 ? rawDpr : 1;
  return `(resolution: ${watchDpr}dppx)`;
};

/**
 * Local discrete interaction snapshot: finite, clamped u/v against the
 * content rect; any invalid input or missing rect falls back to center.
 * This is a one-shot snapshot, never a second continuous pointer authority.
 */
export const resolveDotOriginFromClientPoint = (
  clientX: number,
  clientY: number,
  rect: DotContentRect | null,
): DotOrigin => {
  if (
    rect === null
    || !Number.isFinite(clientX)
    || !Number.isFinite(clientY)
    || !Number.isFinite(rect.left)
    || !Number.isFinite(rect.top)
    || !Number.isFinite(rect.width)
    || !Number.isFinite(rect.height)
    || rect.width <= 0
    || rect.height <= 0
  ) {
    return { u: 0.5, v: 0.5 };
  }
  return {
    u: clamp01((clientX - rect.left) / rect.width),
    v: clamp01((clientY - rect.top) / rect.height),
  };
};

type RgbaColor = Readonly<{ r: number; g: number; b: number; a: number }>;

const parseRgbaColor = (color: string): RgbaColor | null => {
  if (typeof color !== "string") {
    return null;
  }
  const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex !== null) {
    const digits = hex[1];
    const full = digits.length === 3
      ? digits.split("").map((digit) => digit + digit).join("")
      : digits;
    const value = parseInt(full, 16);
    return {
      r: (value >> 16) & 0xff,
      g: (value >> 8) & 0xff,
      b: value & 0xff,
      a: 1,
    };
  }
  const rgba = color.trim().match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i,
  );
  if (rgba !== null) {
    return {
      r: Number(rgba[1]),
      g: Number(rgba[2]),
      b: Number(rgba[3]),
      a: rgba[4] === undefined ? 1 : Number(rgba[4]),
    };
  }
  return null;
};

/**
 * Rendered dot color. `transient` interpolates linearly between the dormant
 * and acknowledgement tokens (brightness dominates); `edgeFactor` scales the
 * final alpha so the dormant grid attenuates softly at the surface boundary
 * and the transient response absorbs into it (soft boundary absorption).
 * Transient 0 with edgeFactor 1 resolves exactly to the dormant token.
 */
export const resolveDotColor = (
  dormant: string,
  ack: string,
  transient: number,
  edgeFactor: number,
): string => {
  const from = parseRgbaColor(dormant);
  const to = parseRgbaColor(ack);
  if (from === null) {
    return ack;
  }
  if (to === null) {
    return dormant;
  }
  const t = clamp01(transient);
  const edge = clamp01(edgeFactor);
  const channel = (start: number, end: number): number => Math.round(start + (end - start) * t);
  const alpha = Math.round(edge * (from.a + (to.a - from.a) * t) * 1000) / 1000;
  return `rgba(${channel(from.r, to.r)}, ${channel(from.g, to.g)}, ${channel(from.b, to.b)}, ${alpha})`;
};
