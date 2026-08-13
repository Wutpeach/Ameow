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
  /**
   * MR3 persistent progress target. Absent (or idle) keeps the MR1
   * dormant/transient-only field behavior. It is a presentation target, never
   * Download/lifecycle authority; the runtime converges toward it locally.
   */
  progress?: DotFieldProgressTarget;
  /**
   * MR4 terminal lane target. Absent (or none) keeps the field on the
   * progress/dormant lanes. It is a separate priority presentation input,
   * never an extension of the Progress authority; the runtime seeds one
   * bounded lane and renders it exactly while the target is present.
   */
  terminal?: DotFieldTerminalTarget;
}>;

/**
 * MR3 projected Download progress target (pure presentation value).
 *
 * - idle: no primary Download; dormant field, no progress work.
 * - determinate: one primary Download with a finite clamped 0..1 target;
 *   `traceId` scopes visual monotonicity (a new trace is replacement, never
 *   continuation of the previous trace's visual stream).
 * - indeterminate: one primary Download whose percent is absent/negative or
 *   whose phase is probing/selecting; active but explicitly non-quantitative.
 *
 * There is deliberately no terminal kind: terminal/removal is observed only as
 * a change of this target back to the next primary or idle.
 */
export type DotFieldProgressTarget =
  | { kind: "idle" }
  | { kind: "indeterminate"; traceId: string }
  | { kind: "determinate"; traceId: string; target: number };

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

// MR3 Progress Field policy ------------------------------------------------
//
// Determinate uses the grid's deterministic row-major order (the grid is
// generated row by row, so the array index IS the rank): dots below the
// current occupancy frontier render at full acknowledgement brightness, the
// frontier dot renders partial, the rest stay dormant. Occupancy is monotone
// in the rendered level and never exceeds the authoritative target, so the
// field communicates amount without owning a percent.
//
// Indeterminate is non-quantitative by construction: normal motion runs a
// soft diagonal sweep band (a bounded travelling accent), and Reduced Motion
// freezes a soft centered bloom. Neither maps motion phase to a numeric
// completion, and neither uses the ordered frontier vocabulary.

/** Deterministic convergence toward a determinate target per frame. */
export const DOT_PROGRESS_CONVERGE_RATE = 0.35;
/** Convergence snap tolerance (occupancy units); below it the target is exact. */
export const DOT_PROGRESS_SNAP = 0.004;
/** Peak brightness of the normal-motion indeterminate sweep band. */
export const DOT_INDETERMINATE_AMPLITUDE = 0.4;
/** Sweep band width in normalized diagonal units (soft exponential skirt). */
export const DOT_INDETERMINATE_BAND_WIDTH = 0.16;
/** One full sweep period. */
export const DOT_INDETERMINATE_PERIOD_MS = 3600;
/** Duty cap: at most one indeterminate-band redraw per interval (low duty). */
export const DOT_INDETERMINATE_DUTY_MS = 33;
/** Peak brightness of the Reduced-Motion static indeterminate bloom. */
export const DOT_INDETERMINATE_REDUCED_AMPLITUDE = 0.3;
/** Bloom radius in normalized surface units. */
export const DOT_INDETERMINATE_REDUCED_RADIUS = 0.42;

/**
 * Deterministic per-dot progress brightness 0..1 for one projected target at
 * the CURRENT rendered state (`progressLevel` is the rendered occupancy for
 * determinate; `phase` is the sweep position 0..1 for indeterminate).
 * Edge/boundary attenuation is applied downstream by `resolveDotColor`, so
 * this function is geometry-only and never maps motion phase to a percent.
 */
export const resolveProgressDotLevel = (
  dot: DotGridPoint,
  dotIndex: number,
  dotCount: number,
  target: DotFieldProgressTarget,
  progressLevel: number,
  phase: number,
  reducedMotion: boolean,
): number => {
  if (target.kind === "idle" || !Number.isFinite(dotCount) || dotCount <= 0) {
    return 0;
  }
  if (target.kind === "determinate") {
    if (!Number.isInteger(dotIndex) || dotIndex < 0 || dotIndex >= dotCount) {
      return 0;
    }
    const occupied = clamp01(progressLevel) * dotCount;
    const full = Math.floor(occupied);
    if (dotIndex < full) {
      return 1;
    }
    if (dotIndex === full) {
      return occupied - full;
    }
    return 0;
  }
  // indeterminate
  if (!dot || !Number.isFinite(dot.u) || !Number.isFinite(dot.v)) {
    return 0;
  }
  const du = Math.abs(dot.u - 0.5);
  const dv = Math.abs(dot.v - 0.5);
  if (reducedMotion) {
    // Stable, non-travelling active material: a soft centered bloom. It is
    // NOT ordered, so it can never be read as a determinate frontier.
    const radius = DOT_INDETERMINATE_REDUCED_RADIUS;
    return DOT_INDETERMINATE_REDUCED_AMPLITUDE * Math.exp(
      -(du * du + dv * dv) / (2 * radius * radius),
    );
  }
  // Soft diagonal sweep band: wrapped distance on the normalized u-v axis.
  const sweep = (dot.u - dot.v + 1) / 2;
  const wrapped = Math.min(
    Math.abs(sweep - (phase % 1)),
    1 - Math.abs(sweep - (phase % 1)),
  );
  return DOT_INDETERMINATE_AMPLITUDE * Math.exp(
    -(wrapped * wrapped) / (2 * DOT_INDETERMINATE_BAND_WIDTH * DOT_INDETERMINATE_BAND_WIDTH),
  );
};

// MR4 Terminal Reveal policy -------------------------------------------------
//
// Terminal is a separate priority lane with its own projected target; it is
// NOT an extension of the MR3 Progress authority. The lane renders only when
// the projection reports it (no current primary task) and is superseded by
// any arriving progress target. Material stays ack-tone and restrained: the
// semantic outcome identity, message, and diagnostic action live in the
// center DOM overlay, so the field only adds a bounded terminal presence.
//
//   success    -> ordered occupancy sweep (the same row-major frontier
//                 vocabulary as determinate progress, now "completed"): dots
//                 light in rank order up to the rendered reveal level.
//   failure    -> centered radial bloom, no travel (an abrupt stop), louder
//                 than cancelled.
//   cancelled  -> centered radial bloom, no travel, quieter than failure.

export type DotFieldTerminalKind = "success" | "failure" | "cancelled";

/**
 * MR4 projected terminal lane target (pure presentation value). `none` is the
 * absence of a terminal lane; `terminal` carries only the typed presentation
 * kind. There is deliberately no trace, message, or retention here: trace
 * identity and retention belong to the owning Presentation (the center
 * overlay state machine), and this target is a disposable renderer input.
 */
export type DotFieldTerminalTarget =
  | { kind: "none" }
  | { kind: "terminal"; status: DotFieldTerminalKind };

/** Convergence snap tolerance for the reveal level (occupancy units). */
export const DOT_TERMINAL_REVEAL_SNAP = 0.004;
/** Per-frame convergence toward the fully revealed level. */
export const DOT_TERMINAL_CONVERGE_RATE = 0.22;
/** Final material amplitude per terminal kind (bounded 0..1, ack-tone). */
export const DOT_TERMINAL_AMPLITUDE: Record<DotFieldTerminalKind, number> = {
  success: 0.16,
  failure: 0.26,
  cancelled: 0.13,
};
/** Bloom radius in normalized surface units for failure/cancelled. */
export const DOT_TERMINAL_BLOOM_RADIUS = 0.42;

/**
 * Deterministic per-dot terminal brightness 0..1 for one kind at the CURRENT
 * rendered reveal level (`level` is 0..1; the runtime seeds it at 1 directly
 * under Reduced Motion). Success uses the ordered frontier vocabulary; failure
 * and cancelled use a centered radial bloom. Boundary attenuation is applied
 * downstream by `resolveDotColor`, exactly like the progress material.
 */
export const resolveTerminalDotLevel = (
  dot: DotGridPoint,
  dotIndex: number,
  dotCount: number,
  kind: DotFieldTerminalKind,
  level: number,
): number => {
  if (!Number.isFinite(dotCount) || dotCount <= 0) {
    return 0;
  }
  const amplitude = DOT_TERMINAL_AMPLITUDE[kind];
  const reveal = clamp01(level);
  if (kind === "success") {
    if (!Number.isInteger(dotIndex) || dotIndex < 0 || dotIndex >= dotCount) {
      return 0;
    }
    const occupied = reveal * dotCount;
    const full = Math.floor(occupied);
    if (dotIndex < full) {
      return amplitude;
    }
    if (dotIndex === full) {
      return amplitude * (occupied - full);
    }
    return 0;
  }
  if (!dot || !Number.isFinite(dot.u) || !Number.isFinite(dot.v)) {
    return 0;
  }
  const du = Math.abs(dot.u - 0.5);
  const dv = Math.abs(dot.v - 0.5);
  const radius = DOT_TERMINAL_BLOOM_RADIUS;
  return amplitude * reveal * Math.exp(
    -(du * du + dv * dv) / (2 * radius * radius),
  );
};

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
