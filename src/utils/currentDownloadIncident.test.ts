import { describe, expect, it } from "vitest";

import {
  createCurrentDownloadIncidentState,
  isCurrentDownloadIncident,
  reduceCurrentDownloadIncident,
} from "./currentDownloadIncident";

const request = (traceId: string) => ({
  surface: "download" as const,
  traceId,
  userMessage: "Download failed",
  category: "unclassified" as const,
});

describe("currentDownloadIncident", () => {
  it("keeps one latest failure and clears only when explicitly told to", () => {
    const first = reduceCurrentDownloadIncident(createCurrentDownloadIncidentState(), {
      type: "capture",
      request: request("first"),
    });
    const second = reduceCurrentDownloadIncident(first, {
      type: "capture",
      request: request("second"),
    });

    expect(second.current).toMatchObject({ request: { traceId: "second" }, generation: 2 });
    expect(isCurrentDownloadIncident(second, 1)).toBe(false);
    expect(isCurrentDownloadIncident(second, 2)).toBe(true);
    expect(reduceCurrentDownloadIncident(second, { type: "clear" }).current).toBeNull();
  });

  it("invalidates stale completion generations across clear and later capture", () => {
    const first = reduceCurrentDownloadIncident(createCurrentDownloadIncidentState(), {
      type: "capture",
      request: request("first"),
    });
    const cleared = reduceCurrentDownloadIncident(first, { type: "clear" });
    const later = reduceCurrentDownloadIncident(cleared, {
      type: "capture",
      request: request("later"),
    });

    expect(isCurrentDownloadIncident(cleared, 1)).toBe(false);
    expect(isCurrentDownloadIncident(later, 1)).toBe(false);
    expect(isCurrentDownloadIncident(later, 2)).toBe(true);
  });
});
