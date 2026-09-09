/**
 * Browser Lab shared geometry and Compact-only scenario model.
 *
 * Full-screen experiment state lives in the embedded Ripple controller; the
 * production-reuse fixture lanes own their data through stateFixtures.ts.
 */
import { MAIN_WINDOW_PANEL_SIZE } from "../constants/windowMetrics";
import type { CompactMascotPreviewPose } from "../presentation/main-window/compactMascotBehaviorRuntime";

/** The production preview surface is exactly 200x200 CSS pixels. */
export const LAB_PREVIEW_SIZE = MAIN_WINDOW_PANEL_SIZE;

export type LabCompactScenarioId =
  | "compact-neutral"
  | "compact-pointer"
  | "compact-reduced"
  | "compact-surprised"
  | "compact-curious"
  | "compact-playful";

export type LabCompactScenario = Readonly<{
  id: LabCompactScenarioId;
  /** Existing renderer capability: live pointer attention or pinned neutral. */
  pointerMode: "live" | "neutral";
  /** Existing-core frozen capture pose; Lab-only and read-only. */
  previewPose: CompactMascotPreviewPose;
  forcedReducedMotion: boolean;
}>;

/** Compact remains a direct view of the existing production renderer leaf. */
export const LAB_COMPACT_SCENARIOS: readonly LabCompactScenario[] = [
  { id: "compact-neutral", pointerMode: "neutral", previewPose: "neutral", forcedReducedMotion: false },
  { id: "compact-pointer", pointerMode: "live", previewPose: "neutral", forcedReducedMotion: false },
  { id: "compact-reduced", pointerMode: "live", previewPose: "neutral", forcedReducedMotion: true },
  { id: "compact-surprised", pointerMode: "neutral", previewPose: "surprised", forcedReducedMotion: false },
  { id: "compact-curious", pointerMode: "neutral", previewPose: "curious-short", forcedReducedMotion: false },
  { id: "compact-playful", pointerMode: "neutral", previewPose: "playful-short", forcedReducedMotion: false },
];

export const LAB_COMPACT_SCENARIO_IDS = LAB_COMPACT_SCENARIOS.map(
  (scenario) => scenario.id,
) as readonly LabCompactScenarioId[];

export const resolveLabCompactScenario = (id: string): LabCompactScenario | null =>
  LAB_COMPACT_SCENARIOS.find((scenario) => scenario.id === id) ?? null;
