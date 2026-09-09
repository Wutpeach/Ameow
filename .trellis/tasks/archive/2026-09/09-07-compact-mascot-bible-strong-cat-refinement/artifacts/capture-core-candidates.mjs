import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createServer } from "vite";
import {
  advanceAvatarPlayback,
  applyAmbientMotion,
  bodyFromDefinition,
  createAvatarPlaybackState,
  playAvatarAnimation,
  poseFromExpression,
  renderAvatar,
  sampleAvatarFrame,
  validateAvatarDefinition,
} from "@bible-strong/avatar-core";

const outputDir = resolve(import.meta.dirname);
const random = () => 0.5;
const colors = { body: "#5b7fe5", eyes: "#111316" };
const states = [
  { id: "neutral", label: "Neutral", action: null, at: 0, eyeOffset: { x: 0, y: 0 } },
  { id: "pointer", label: "Bounded pointer", action: "idle", at: 0, eyeOffset: { x: 11, y: -7.5 } },
  { id: "surprised", label: "surprised", action: "surprised", at: 800, eyeOffset: { x: 0, y: 0 } },
  { id: "curious", label: "curious-short", action: "curious-short", at: 3700, eyeOffset: { x: 0, y: 0 } },
  { id: "playful", label: "playful-short", action: "playful-short", at: 3700, eyeOffset: { x: 0, y: 0 } },
];

const escape = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");

const renderScene = (definition, state) => {
  const body = bodyFromDefinition(definition.body);
  let playback = createAvatarPlaybackState();
  if (state.action !== null) {
    const started = playAvatarAnimation(definition, state.action, 0);
    if (!started.ok) throw new Error(started.error.message);
    playback = advanceAvatarPlayback(definition, started.value, state.at, { random });
  }
  const frame = sampleAvatarFrame(definition, playback, state.at, { random });
  const pose = poseFromExpression(applyAmbientMotion(frame.expression, frame.sampledAt));
  return renderAvatar(pose, body.primary, frame.blink, {
    bodyNodes: body.nodes,
    eyeOffset: state.eyeOffset,
  });
};

const face = (geometry, x, y, size, shellFill, shellStroke) => {
  const inset = (size - 56) / 2;
  const mascot = `<svg x="${x + inset}" y="${y + inset}" width="56" height="56" viewBox="-150 -150 300 300" aria-hidden="true">
    ${geometry.backPaths.map((path) => `<path d="${path}" fill="${colors.body}"/>`).join("")}
    <path d="${geometry.headPath}" fill="${colors.body}"/>
    <path d="${geometry.leftPath}" fill="${colors.eyes}" opacity="${geometry.leftVisible ? 1 : 0}"/>
    <path d="${geometry.rightPath}" fill="${colors.eyes}" opacity="${geometry.rightVisible ? 1 : 0}"/>
    ${geometry.frontPaths.map((path) => `<path d="${path}" fill="${colors.body}"/>`).join("")}
  </svg>`;
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size / 2}" fill="${shellFill}" stroke="${shellStroke}"/>${mascot}`;
};

const sheet = (title, definition, theme) => {
  const shell = theme === "white" ? { fill: "#f7f7f8", stroke: "#d8d8da", page: "#e3e3e3", text: "#333333" } : { fill: "#2b2a31", stroke: "#4b4951", page: "#201e25", text: "#eeeeee" };
  const columns = states.map((state, index) => {
    const x = 24 + index * 244;
    const geometry = renderScene(definition, state);
    return `<text x="${x}" y="28" fill="${shell.text}" font-family="system-ui" font-size="14" font-weight="600">${escape(state.label)}</text>
      <text x="${x}" y="49" fill="${shell.text}" font-family="system-ui" font-size="11" opacity=".72">actual 56px holder</text>
      ${face(geometry, x, 64, 60, shell.fill, shell.stroke)}
      <text x="${x}" y="156" fill="${shell.text}" font-family="system-ui" font-size="11" opacity=".72">magnified, same core output</text>
      ${face(geometry, x, 172, 224, shell.fill, shell.stroke)}`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1244" height="420" viewBox="0 0 1244 420" role="img" aria-label="${escape(title)}">
    <rect width="1244" height="420" fill="${shell.page}"/>
    <text x="24" y="397" fill="${shell.text}" font-family="system-ui" font-size="12" opacity=".72">${escape(title)} · canonical avatar-core definition and current-pose projection</text>
    ${columns}
  </svg>\n`;
};

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const { COMPACT_MASCOT_DEFINITION, KIRBY_SOURCE_BODY, KIRBY_UPSTREAM_REVISION } = await vite.ssrLoadModule("/src/presentation/main-window/compactMascotDefinition.ts");
  const candidates = {
    baseline: {
      ...COMPACT_MASCOT_DEFINITION,
      body: {
        ...COMPACT_MASCOT_DEFINITION.body,
        nodes: [-1, 1].map((side) => ({
          surface: { type: "diamond", width: 76, height: 135, depth: 78, roundness: 1 },
          position: [side * 70, -76, -82],
          rotation: [0, side * 5, side * 10],
        })),
      },
    },
    "cone-a": {
      ...COMPACT_MASCOT_DEFINITION,
      body: {
        ...COMPACT_MASCOT_DEFINITION.body,
        nodes: [-1, 1].map((side) => ({
          surface: { type: "cone", width: 82, height: 124, depth: 84, roundness: 0.82, tipRoundness: 0.42, baseRoundness: 0.72 },
          position: [side * 68, -72, -84],
          rotation: [0, side * 6, side * 8],
        })),
      },
    },
    "cone-b": {
      ...COMPACT_MASCOT_DEFINITION,
      body: {
        ...COMPACT_MASCOT_DEFINITION.body,
        nodes: [-1, 1].map((side) => ({
          surface: { type: "cone", width: 76, height: 132, depth: 80, roundness: 0.9, tipRoundness: 0.48, baseRoundness: 0.76 },
          position: [side * 70, -75, -86],
          rotation: [0, side * 5, side * 9],
        })),
      },
    },
  };
  await mkdir(outputDir, { recursive: true });
  for (const [id, definition] of Object.entries(candidates)) {
    const validation = validateAvatarDefinition(definition);
    if (!validation.ok) throw new Error(`${id}: ${validation.errors[0]?.message ?? "invalid definition"}`);
    for (const theme of ["black", "white"]) {
      await writeFile(resolve(outputDir, `${id}-${theme}.svg`), sheet(`${id} · ${theme}`, validation.value, theme));
    }
  }
  await writeFile(resolve(outputDir, "capture-metadata.json"), `${JSON.stringify({
    generator: "capture-core-candidates.mjs",
    kirby: { revision: KIRBY_UPSTREAM_REVISION, sourceBody: KIRBY_SOURCE_BODY },
    candidates: Object.keys(candidates),
    states: states.map(({ id, action, at, eyeOffset }) => ({ id, action, at, eyeOffset })),
    note: "SVG evidence uses the installed avatar-core's body/pose/current-frame projection. Cone variants are evidence-only and are not production changes. This direct-core sheet has a known magnification defect and is diagnostic, not acceptance evidence.",
  }, null, 2)}\n`);
} finally {
  await vite.close();
}
