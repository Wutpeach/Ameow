import { describe, expect, it } from "vitest";
import { DEFAULT_LAB_URL_STATE, parseLabUrlState, serializeLabUrlState } from "./scenarioUrl";

describe("Lab URL state", () => {
  it("parses the allow-listed scenario contract and capture default motion", () => {
    expect(parseLabUrlState(new URLSearchParams("scenario=runtime-failed&theme=white&reducedMotion=false&capture=true"))).toEqual({
      scenario: "runtime-failed", theme: "white", reducedMotion: false, capture: true,
    });
    expect(parseLabUrlState(new URLSearchParams("scenario=compact-pointer&capture=true"))).toEqual({
      scenario: "compact-pointer", theme: "black", reducedMotion: true, capture: true,
    });
  });

  it("falls back without throwing for incomplete or invalid query values", () => {
    expect(parseLabUrlState(new URLSearchParams("scenario=nope&theme=neon&reducedMotion=maybe&capture=no"), true)).toEqual({
      ...DEFAULT_LAB_URL_STATE,
      reducedMotion: true,
    });
  });

  it("serializes only stable documented values for History API updates", () => {
    expect(serializeLabUrlState({ scenario: "download-queued", theme: "white", reducedMotion: true, capture: false })).toBe(
      "scenario=download-queued&theme=white&reducedMotion=true&capture=false",
    );
  });
});
