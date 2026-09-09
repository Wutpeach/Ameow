/**
 * Source-fidelity visual kernel for the MR9 Ripple Browser Lab only.
 *
 * Derived from m1ckc3s/ripple, commit
 * 99ee6e4412bcab34bcb4337f5f21845ae87c12d5, original path
 * src/components/RippleTransition.tsx.
 *
 * Modifications: Ameow owns fixtures, phase, origin, lifecycle, and WebGL
 * resource cleanup. The pinned WebGL1 visual math below is otherwise retained.
 * Upstream credits Minsang (@radiofun8), "Ripple with Noise". No Minsang Metal
 * source is used.
 *
 * MIT License
 * Copyright (c) 2026 Mick Cesanek
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions: The above copyright
 * notice and this permission notice shall be included in all copies or
 * substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS",
 * WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
 * TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
 * FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR
 * THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

export const RIPPLE_USER_BASELINE = Object.freeze({
  durationMs: 1400,
  sigma: 0.15,
  waveFreq: 5,
  pushAmt: 0.155,
  caStrength: 0.0225,
  glow: 0.37,
  noiseWarp: 0.7,
  pinchStrength: 0.14,
});

export const power3Out = (phase: number): number =>
  1 - (1 - Math.min(Math.max(phase, 0), 1)) ** 3;

/** Source pinch keyframes, expressed against the Ameow-owned raw 1.4 s phase. */
export const sourcePinchAt = (rawPhase: number, enabled: boolean): number => {
  if (!enabled) return 0;
  const elapsed = Math.min(Math.max(rawPhase, 0), 1) * RIPPLE_USER_BASELINE.durationMs;
  if (elapsed <= 100) return RIPPLE_USER_BASELINE.pinchStrength * power3Out(elapsed / 100);
  if (elapsed <= 500) {
    const t = (elapsed - 100) / 400;
    return RIPPLE_USER_BASELINE.pinchStrength * (1 - t ** 2);
  }
  return 0;
};

export const RIPPLE_VERTEX_SOURCE = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const RIPPLE_FRAGMENT_SOURCE = `
precision highp float;
uniform sampler2D u_texA;
uniform sampler2D u_texB;
uniform vec2 u_resolution;
uniform vec2 u_center;
uniform float u_progress;
uniform float u_sigma;
uniform float u_waveFreq;
uniform float u_pushAmt;
uniform float u_caStrength;
uniform float u_glow;
uniform float u_noiseWarp;
uniform float u_swap;
uniform float u_pinch;
varying vec2 v_uv;
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p, int octaves) {
  float val = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    val += amp * vnoise(p * freq);
    freq *= 2.0;
    amp *= 0.5;
  }
  return val;
}
void main() {
  vec2 uv = v_uv;
  vec2 size = u_resolution;
  vec2 center = u_center;
  vec2 p = uv - center;
  float aspect = size.x / size.y;
  p.x *= aspect;
  float dist = length(p);
  float maxDist = length(vec2(0.5 * aspect, 0.5));
  float normDist = clamp(dist / maxDist, 0.0, 1.0);
  float noiseLarge = fbm(p * 4.0 + vec2(u_progress * 1.0, u_progress * 0.5), 4);
  float noiseSmall = fbm(p * 12.0 + vec2(u_progress * 2.0, -u_progress * 1.5), 3);
  float coverage = 1.0 + 0.5 * u_noiseWarp + 0.1;
  float waveFront = u_progress * coverage;
  float warpScale = smoothstep(0.0, 0.05, u_progress);
  float warpedDist = normDist
    + (noiseLarge - 0.5) * u_noiseWarp * warpScale
    + (noiseSmall - 0.5) * (u_noiseWarp * 0.9) * warpScale;
  float delta = warpedDist - waveFront;
  float baseEnvelope = exp(-delta * delta / (2.0 * u_sigma * u_sigma));
  float ripples = max(0.0, cos(delta * u_waveFreq));
  float envelope = baseEnvelope * ripples;
  float gate = smoothstep(0.0, 0.05, u_progress)
             * (1.0 - smoothstep(0.85, 1.0, u_progress));
  envelope *= gate;
  vec2 dir = (dist > 0.001) ? normalize(p) : vec2(0.0);
  float pushAmt = envelope * u_pushAmt;
  float pinchSigma = 0.10;
  float pinchG = exp(-dist * dist / (2.0 * pinchSigma * pinchSigma));
  float pinchDisp = (dist / (pinchSigma * pinchSigma)) * pinchG * 0.01 * u_pinch;
  vec2 toEdge = min(uv, 1.0 - uv);
  float edgeFade = smoothstep(0.0, 0.14, min(toEdge.x, toEdge.y));
  pinchDisp *= edgeFade;
  vec2 uvOffset = dir * (pushAmt - pinchDisp);
  uvOffset.x /= aspect;
  float caStrength = envelope * u_caStrength;
  vec2 caOffset = dir * caStrength;
  caOffset.x /= aspect;
  vec2 uvR = uv - uvOffset - caOffset;
  vec2 uvG = uv - uvOffset;
  vec2 uvB = uv - uvOffset + caOffset;
  vec4 colorA = vec4(texture2D(u_texA, uvR).r, texture2D(u_texA, uvG).g, texture2D(u_texA, uvB).b, 1.0);
  vec4 colorB = vec4(texture2D(u_texB, uvR).r, texture2D(u_texB, uvG).g, texture2D(u_texB, uvB).b, 1.0);
  float feather = 0.04 + 0.05 * noiseLarge;
  float reveal = smoothstep(waveFront + feather, waveFront - feather, warpedDist);
  reveal *= smoothstep(0.0, 0.05, u_progress);
  vec4 base = mix(colorA, colorB, u_swap);
  vec4 target = mix(colorB, colorA, u_swap);
  vec4 color = mix(base, target, reveal);
  float glow = envelope * u_glow;
  color.rgb = clamp(color.rgb / max(1.0 - glow, 0.01), 0.0, 1.0);
  color.rgb *= 1.0 - 0.16 * pinchG * edgeFade * u_pinch;
  color.rgb = clamp(color.rgb, 0.0, 1.0);
  gl_FragColor = vec4(color.rgb, 1.0);
}`;
