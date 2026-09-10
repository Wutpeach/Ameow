import type { Theme } from "../contexts/ThemeContext";
import { DEFAULT_LAB_SCENARIO_ID, resolveLabScenario, type LabScenarioId } from "./scenarios";

export type LabUrlState = Readonly<{
  scenario: LabScenarioId;
  theme: Theme;
  reducedMotion: boolean;
  capture: boolean;
}>;

export const DEFAULT_LAB_URL_STATE: LabUrlState = {
  scenario: DEFAULT_LAB_SCENARIO_ID,
  theme: "black",
  reducedMotion: false,
  capture: false,
};

const parseBoolean = (value: string | null, fallback: boolean): boolean => {
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
};

/** Parses only the documented Lab query values; unknown values never throw. */
export const parseLabUrlState = (
  params: URLSearchParams,
  reducedMotionDefault = DEFAULT_LAB_URL_STATE.reducedMotion,
): LabUrlState => {
  const capture = parseBoolean(params.get("capture"), DEFAULT_LAB_URL_STATE.capture);
  return {
    scenario: resolveLabScenario(params.get("scenario") ?? "")?.id ?? DEFAULT_LAB_SCENARIO_ID,
    theme: params.get("theme") === "white" ? "white" : "black",
    // Capture stays stable for automation even when the browser preference differs.
    reducedMotion: parseBoolean(params.get("reducedMotion"), capture ? true : reducedMotionDefault),
    capture,
  };
};

/** Emits the complete allow-listed contract, dropping unknown query inputs. */
export const serializeLabUrlState = (state: LabUrlState): string => {
  const params = new URLSearchParams({
    scenario: state.scenario,
    theme: state.theme,
    reducedMotion: String(state.reducedMotion),
    capture: String(state.capture),
  });
  return params.toString();
};
