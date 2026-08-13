// Character Recipe: pure geometry and attention projection for the compact
// Flat Blob Cat. This module is a renderer-local leaf (MR0 leaf rule set): it
// imports nothing, reads no DOM/native coordinates, and never writes lifecycle,
// Pointer Field, Product, or IPC state. The host passes the existing Pointer
// Field values read-only; everything here is a pure function of its inputs.

// Static Mark geometry. Body and ear paths are drawn CENTERED on the origin;
// the host places them at the visual center (30, 32) of the 60x60 viewBox with
// a static translate. Eye primitives live in the outer 60x60 viewBox space.
// These coordinates are local visual-tuning constants; the 38px hotspot and
// the 80x80 reachable frame are independent native metrics and are not derived
// from this geometry.
export const CHARACTER_VIEWBOX = 60;
export const CHARACTER_VISUAL_SIZE = 56;
export const CHARACTER_BODY_CENTER = { x: 30, y: 32 };

// Soft rounded blob body, ~44 wide x ~42 tall, centered on the origin — large
// enough that the rendered silhouette meaningfully fills the 60x60 shell
// (rendered width ≈ 41px, wider than the legacy 38px CatIcon) while keeping
// safe margins on every side of the viewBox.
export const CHARACTER_BODY_PATH = [
  "M 0 -20",
  "C 12 -20, 22 -13, 22 -4",
  "C 22 6, 17 16, 9 20",
  "C 4 22.5, -4 22.5, -9 20",
  "C -17 16, -22 6, -22 -4",
  "C -22 -13, -12 -20, 0 -20 Z",
].join(" ");

// Pointed-but-soft ears with readable apices above the wider body; bases
// blend into the body top.
export const CHARACTER_EAR_LEFT_PATH = [
  "M -13 -18.5",
  "C -14.5 -22.5, -16 -25.5, -17.5 -28.5",
  "C -15.5 -25, -12.8 -21.5, -9.5 -18.2 Z",
].join(" ");

export const CHARACTER_EAR_RIGHT_PATH = [
  "M 13 -18.5",
  "C 14.5 -22.5, 16 -25.5, 17.5 -28.5",
  "C 15.5 -25, 12.8 -21.5, 9.5 -18.2 Z",
].join(" ");

// Two capsule eyes (rx < ry) in a shared attention/blink group.
export const CHARACTER_EYE_LEFT = { x: 23.5, y: 32 };
export const CHARACTER_EYE_RIGHT = { x: 36.5, y: 32 };
export const CHARACTER_EYE_RADIUS_X = 2.6;
export const CHARACTER_EYE_RADIUS_Y = 3.6;

// Attention projection bounds. Stable-root coordinates are viewport-local
// pixels; the response radius keeps the surrounding transparent viewport from
// pulling the eyes indefinitely, and the dead zone keeps tiny jitter neutral.
// The response is a continuous bounded bump: zero inside the dead zone, rising
// smoothly to its peak at the midpoint of [dead zone, response radius] — right
// at the compact hotspot approach band (19px enter / 23px exit radii) — then
// decaying continuously to zero exactly at the response radius.
export const CHARACTER_ATTENTION_RESPONSE_RADIUS = 46;
export const CHARACTER_ATTENTION_DEAD_ZONE = 3;
export const CHARACTER_ATTENTION_PEAK_DISTANCE =
  (CHARACTER_ATTENTION_DEAD_ZONE + CHARACTER_ATTENTION_RESPONSE_RADIUS) / 2;
export const CHARACTER_EYE_MAX_X = 2.2;
export const CHARACTER_EYE_MAX_Y = 1.5;
export const CHARACTER_EYE_MAX_X_REDUCED = 1.2;
export const CHARACTER_EYE_MAX_Y_REDUCED = 0.8;
// Tiny pointer-coupled body squash; zero under Reduced Motion.
export const CHARACTER_BODY_MAX_SQUASH = 0.014;

export type CharacterAttentionPoint = {
  x: number;
  y: number;
};

export type CharacterAttentionTarget = {
  /** Eye group offset in SVG viewBox units; (0,0) is neutral. */
  x: number;
  y: number;
  /** Uniform body scale around the body center; 1 is undeformed. */
  bodyScale: number;
};

export const NEUTRAL_CHARACTER_ATTENTION_TARGET: CharacterAttentionTarget = {
  x: 0,
  y: 0,
  bodyScale: 1,
};

/**
 * Bounded continuous response intensity for one distance from the compact
 * visual center: zero inside the dead zone, a smooth rise to the peak at
 * CHARACTER_ATTENTION_PEAK_DISTANCE (the hotspot approach band), and a
 * continuous decay to zero exactly at the response radius. The SAME intensity
 * scales the eye offset and the body squash, so deformation follows the
 * attention response.
 */
const resolveCharacterAttentionIntensity = (distance: number): number => {
  if (
    distance <= CHARACTER_ATTENTION_DEAD_ZONE
    || distance >= CHARACTER_ATTENTION_RESPONSE_RADIUS
  ) {
    return 0;
  }
  const t = (distance - CHARACTER_ATTENTION_DEAD_ZONE)
    / (CHARACTER_ATTENTION_RESPONSE_RADIUS - CHARACTER_ATTENTION_DEAD_ZONE);
  return 0.5 * (1 - Math.cos(2 * Math.PI * t));
};

/**
 * Maps one stable-root Pointer Field point into the clamped Character target.
 *
 * - Non-finite or invalid coordinates project neutral (observable
 *   leave/loss/reset surfaces already reset the field to center).
 * - The response is continuous and bounded: neutral inside the dead zone and
 *   at/outside the response radius, peaking at the hotspot approach band, so
 *   the transparent remainder of the stable viewport cannot hold the eyes and
 *   the direction is normalized and clamped to a narrow ellipse.
 * - Reduced Motion keeps a smaller direct attention offset and removes body
 *   deformation and spring lag/overshoot (springs are the host's concern).
 */
export const resolveCharacterAttentionTarget = (
  point: CharacterAttentionPoint,
  center: CharacterAttentionPoint,
  reducedMotion: boolean,
): CharacterAttentionTarget => {
  if (
    !Number.isFinite(point.x)
    || !Number.isFinite(point.y)
    || !Number.isFinite(center.x)
    || !Number.isFinite(center.y)
  ) {
    return NEUTRAL_CHARACTER_ATTENTION_TARGET;
  }
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance)) {
    return NEUTRAL_CHARACTER_ATTENTION_TARGET;
  }
  const intensity = resolveCharacterAttentionIntensity(distance);
  if (intensity === 0) {
    return NEUTRAL_CHARACTER_ATTENTION_TARGET;
  }
  const normalizedX = dx / distance;
  const normalizedY = dy / distance;
  const maxX = reducedMotion ? CHARACTER_EYE_MAX_X_REDUCED : CHARACTER_EYE_MAX_X;
  const maxY = reducedMotion ? CHARACTER_EYE_MAX_Y_REDUCED : CHARACTER_EYE_MAX_Y;
  const bodyScale = reducedMotion
    ? 1
    : 1 + CHARACTER_BODY_MAX_SQUASH * intensity;
  return {
    x: normalizedX * maxX * intensity,
    y: normalizedY * maxY * intensity,
    bodyScale,
  };
};

/**
 * Stable spring source gate for the attention springs. Motion 12 useSpring
 * never rebinds its source (its follow effect omits the source identity), so
 * the host keeps each spring bound to ONE permanent MotionValue and drives
 * this gate instead: while normal motion is active the source follows the live
 * attention target; while Reduced Motion is active the source holds the last
 * normal target — a constant, so the spring does zero work and leaves no
 * decorative tail — and the next normal flip resumes spring-follow from the
 * current condition immediately.
 */
export const resolveGatedSpringSource = (
  liveTarget: number,
  reducedActive: boolean,
  lastNormalTarget: number,
): number => (reducedActive ? lastNormalTarget : liveTarget);
