/** The finite, URL-safe scenario contract shared by the Lab UI and capture. */
import { MAIN_WINDOW_PANEL_SIZE } from "../constants/windowMetrics";
import type { CompactMascotPreviewPose } from "../presentation/main-window/compactMascotBehaviorRuntime";
import type { LabPreviewTarget } from "./previewTargets";

/** The production Full preview surface remains exactly 200 CSS pixels. */
export const LAB_PREVIEW_SIZE = MAIN_WINDOW_PANEL_SIZE;

export const LAB_SCENARIO_IDS = [
  "ripple-reference",
  "download-active",
  "download-queued",
  "transcode-active",
  "transcode-failed",
  "runtime-auto-config",
  "runtime-failed",
  "mixed-busy",
  "compact-neutral",
  "compact-pointer",
  "compact-reduced",
  "compact-surprised",
  "compact-curious",
  "compact-playful",
] as const;

export type LabScenarioId = (typeof LAB_SCENARIO_IDS)[number];
export type LabCompactScenarioId = Extract<LabScenarioId, `compact-${string}`>;

type LabScenarioBase = Readonly<{
  id: LabScenarioId;
  target: LabPreviewTarget;
  labelKey: string;
  descriptionKey?: string;
}>;

export type LabOverlayScenario = LabScenarioBase & Readonly<{
  renderer: "overlay";
  fixtureId: string;
}>;

export type LabCompactScenario = LabScenarioBase & Readonly<{
  id: LabCompactScenarioId;
  renderer: "compact";
  pointerMode: "live" | "neutral";
  previewPose: CompactMascotPreviewPose;
  forcedReducedMotion: boolean;
}>;

export type LabRippleScenario = LabScenarioBase & Readonly<{
  id: "ripple-reference";
  renderer: "ripple";
}>;

export type LabScenario = LabOverlayScenario | LabCompactScenario | LabRippleScenario;

/**
 * Every Lab-visible state belongs here. Do not create target-local lists: the
 * panel, URL parser, and capture runner all resolve this same registry.
 */
export const LAB_SCENARIOS: readonly LabScenario[] = [
  {
    id: "ripple-reference",
    target: "full",
    renderer: "ripple",
    labelKey: "presets.rippleReference.label",
    descriptionKey: "presets.rippleReference.description",
  },
  {
    id: "download-active",
    target: "full",
    renderer: "overlay",
    fixtureId: "download-active",
    labelKey: "presets.downloadActive.label",
    descriptionKey: "presets.downloadActive.description",
  },
  {
    id: "download-queued",
    target: "full",
    renderer: "overlay",
    fixtureId: "download-queued",
    labelKey: "presets.downloadQueued.label",
    descriptionKey: "presets.downloadQueued.description",
  },
  {
    id: "transcode-active",
    target: "full",
    renderer: "overlay",
    fixtureId: "transcode-active",
    labelKey: "presets.transcodeActive.label",
    descriptionKey: "presets.transcodeActive.description",
  },
  {
    id: "transcode-failed",
    target: "full",
    renderer: "overlay",
    fixtureId: "transcode-failed",
    labelKey: "presets.transcodeFailed.label",
    descriptionKey: "presets.transcodeFailed.description",
  },
  {
    id: "runtime-auto-config",
    target: "full",
    renderer: "overlay",
    fixtureId: "runtime-auto-config",
    labelKey: "presets.runtimeAutoConfig.label",
    descriptionKey: "presets.runtimeAutoConfig.description",
  },
  {
    id: "runtime-failed",
    target: "full",
    renderer: "overlay",
    fixtureId: "runtime-failed",
    labelKey: "presets.runtimeFailed.label",
    descriptionKey: "presets.runtimeFailed.description",
  },
  {
    id: "mixed-busy",
    target: "full",
    renderer: "overlay",
    fixtureId: "mixed-busy",
    labelKey: "presets.mixedBusy.label",
    descriptionKey: "presets.mixedBusy.description",
  },
  { id: "compact-neutral", target: "compact", renderer: "compact", pointerMode: "neutral", previewPose: "neutral", forcedReducedMotion: false, labelKey: "presets.compactNeutral.label" },
  { id: "compact-pointer", target: "compact", renderer: "compact", pointerMode: "live", previewPose: "neutral", forcedReducedMotion: false, labelKey: "presets.compactPointer.label" },
  { id: "compact-reduced", target: "compact", renderer: "compact", pointerMode: "live", previewPose: "neutral", forcedReducedMotion: true, labelKey: "presets.compactReduced.label" },
  { id: "compact-surprised", target: "compact", renderer: "compact", pointerMode: "neutral", previewPose: "surprised", forcedReducedMotion: false, labelKey: "presets.compactSurprised.label" },
  { id: "compact-curious", target: "compact", renderer: "compact", pointerMode: "neutral", previewPose: "curious-short", forcedReducedMotion: false, labelKey: "presets.compactCurious.label" },
  { id: "compact-playful", target: "compact", renderer: "compact", pointerMode: "neutral", previewPose: "playful-short", forcedReducedMotion: false, labelKey: "presets.compactPlayful.label" },
];

export const DEFAULT_LAB_SCENARIO_ID: LabScenarioId = "download-active";

export const resolveLabScenario = (id: string): LabScenario | null =>
  LAB_SCENARIOS.find((scenario) => scenario.id === id) ?? null;

export const LAB_COMPACT_SCENARIOS = LAB_SCENARIOS.filter(
  (scenario): scenario is LabCompactScenario => scenario.renderer === "compact",
);

export const LAB_COMPACT_SCENARIO_IDS = LAB_COMPACT_SCENARIOS.map(
  (scenario) => scenario.id,
) as readonly LabCompactScenarioId[];

export const resolveLabCompactScenario = (id: string): LabCompactScenario | null => {
  const scenario = resolveLabScenario(id);
  return scenario?.renderer === "compact" ? scenario : null;
};
