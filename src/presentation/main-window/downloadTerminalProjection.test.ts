import { describe, expect, it } from "vitest";
import {
  createCenterOverlayState,
  type CenterOverlayState,
} from "../../utils/centerOverlayState";
import type { ExpandedPresentationTerminalTarget } from "./expandedPresentationTargets";
import {
  resolveDownloadTerminalTarget,
  shouldInvalidateTerminalRevealForPrimaryDownload,
  shouldShowDownloadTerminalReveal,
} from "./downloadTerminalProjection";

/**
 * MR4 conformance tests for the pure Download-terminal -> Presentation target
 * projection: current-task invalidation, Download-only sourcing, typed
 * three-way kind mapping, and absence of any retention/classification state.
 */

const outcomeState = (
  status: "success" | "failure" | "cancelled",
  source: "download" | "transcode" | "image" = "download",
  origin: "terminal" | "foreground" = "terminal",
): CenterOverlayState => ({
  kind: "task-outcome-visible",
  requestId: 1,
  source,
  status,
  origin,
  message: null,
  durationMs: 1500,
  diagnostic: null,
});

const loadingState = (
  status: "success" | "failure" | "cancelled",
  origin: "terminal" | "foreground" = "terminal",
): CenterOverlayState => ({
  kind: "task-outcome-loading",
  requestId: 1,
  source: "download",
  status,
  origin,
  message: null,
  durationMs: 1500,
  diagnostic: null,
});

describe("Expanded Presentation terminal projection", () => {
  it("maps typed download outcomes to the three-way terminal lane", () => {
    expect(resolveDownloadTerminalTarget(outcomeState("success"), null)).toEqual({
      kind: "terminal",
      status: "success",
    });
    expect(resolveDownloadTerminalTarget(outcomeState("failure"), null)).toEqual({
      kind: "terminal",
      status: "failure",
    });
    expect(resolveDownloadTerminalTarget(outcomeState("cancelled"), null)).toEqual({
      kind: "terminal",
      status: "cancelled",
    });
  });

  it("projects during the loading phase too (target precedes shell eligibility)", () => {
    expect(resolveDownloadTerminalTarget(loadingState("success"), null)).toEqual({
      kind: "terminal",
      status: "success",
    });
  });

  it("projects none from idle, processing, and folder outcomes", () => {
    expect(resolveDownloadTerminalTarget(createCenterOverlayState(), null)).toEqual(
      { kind: "none" },
    );
    expect(resolveDownloadTerminalTarget(
      { kind: "task-processing", requestId: 1, source: "image" },
      null,
    )).toEqual({ kind: "none" });
    expect(resolveDownloadTerminalTarget(
      { kind: "folder-outcome-visible", requestId: 1, status: "success", message: null, durationMs: 1400 },
      null,
    )).toEqual({ kind: "none" });
  });

  it("projects none for non-Download task outcomes (transcode/image stay on their own paths)", () => {
    expect(resolveDownloadTerminalTarget(outcomeState("success", "transcode"), null)).toEqual(
      { kind: "none" },
    );
    expect(resolveDownloadTerminalTarget(outcomeState("failure", "image"), null)).toEqual(
      { kind: "none" },
    );
  });

  it("invalidates the lane immediately while a current primary download exists", () => {
    const terminal: ExpandedPresentationTerminalTarget = { kind: "terminal", status: "success" };
    // A current primary DOWNLOAD always wins over a stored outcome: the
    // projection returns none, never a hidden-and-retained lane.
    expect(resolveDownloadTerminalTarget(outcomeState("success"), {
      traceId: "trace-next",
    })).toEqual({ kind: "none" });
    // Same assertion for the loading phase.
    expect(resolveDownloadTerminalTarget(loadingState("cancelled"), {
      traceId: "trace-next",
    })).toEqual({ kind: "none" });
    expect(terminal).toEqual({ kind: "terminal", status: "success" });
  });

  it("is Download-only for interruption: no Transcode rule is encodable", () => {
    // The projection takes only the current primary DOWNLOAD fact
    // (selectPrimaryDownloadTask result); MR4 has no Transcode interruption
    // semantics. A stored typed terminal keeps projecting whenever no primary
    // download exists, regardless of what the center overlay selector shows
    // for a Transcode primary.
    expect(resolveDownloadTerminalTarget(outcomeState("failure"), null)).toEqual({
      kind: "terminal",
      status: "failure",
    });
    expect(resolveDownloadTerminalTarget(outcomeState("success"), null)).toEqual({
      kind: "terminal",
      status: "success",
    });
  });

  it("never projects generic foreground outcomes (enqueue/command failure, image tasks)", () => {
    // source "download" alone is not a terminal: generic outcomes default to
    // origin "foreground" and must never seed the MR4 lane.
    expect(resolveDownloadTerminalTarget(outcomeState("failure", "download", "foreground"), null))
      .toEqual({ kind: "none" });
    expect(resolveDownloadTerminalTarget(outcomeState("success", "download", "foreground"), null))
      .toEqual({ kind: "none" });
    expect(resolveDownloadTerminalTarget(loadingState("failure", "foreground"), null))
      .toEqual({ kind: "none" });
    // Typed terminal origin still projects, and still only for downloads.
    expect(resolveDownloadTerminalTarget(outcomeState("success", "download", "terminal"), null))
      .toEqual({ kind: "terminal", status: "success" });
    expect(resolveDownloadTerminalTarget(outcomeState("success", "transcode", "terminal"), null))
      .toEqual({ kind: "none" });
  });

  it("is a pure current-state function: the same inputs always yield the same target", () => {
    const a = resolveDownloadTerminalTarget(outcomeState("cancelled"), null);
    const b = resolveDownloadTerminalTarget(outcomeState("cancelled"), null);
    expect(a).toEqual(b);
  });
});

describe("MR4 App-level decisions: background terminal and primary invalidation", () => {
  it("suppresses a background terminal while another download is the current primary", () => {
    // The input is the POST-reduction primary: terminalReceived has already
    // pruned the terminal's own trace, so a non-null primary is necessarily
    // another download — there is no own-primary show branch.
    expect(shouldShowDownloadTerminalReveal({ traceId: "primary-b" })).toBe(false);
  });

  it("shows the terminal when no current primary download remains after reduction", () => {
    expect(shouldShowDownloadTerminalReveal(null)).toBe(true);
  });

  it("invalidates a lingering download Reveal as soon as a new primary download exists", () => {
    expect(shouldInvalidateTerminalRevealForPrimaryDownload(
      outcomeState("success"),
      { traceId: "new-primary" },
    )).toBe(true);
    expect(shouldInvalidateTerminalRevealForPrimaryDownload(
      loadingState("cancelled"),
      { traceId: "new-primary" },
    )).toBe(true);
  });

  it("never invalidates on behalf of a missing primary download", () => {
    expect(shouldInvalidateTerminalRevealForPrimaryDownload(outcomeState("success"), null))
      .toBe(false);
  });

  it("does not invalidate non-terminal transients (generic download/enqueue, transcode, image, folder stay outside MR4)", () => {
    // A generic download-sourced outcome (enqueue/command failure, image
    // task defaulting to source "download") is NOT a typed terminal and is
    // never invalidated as one.
    expect(shouldInvalidateTerminalRevealForPrimaryDownload(
      outcomeState("failure", "download", "foreground"),
      { traceId: "new-primary" },
    )).toBe(false);
    expect(shouldInvalidateTerminalRevealForPrimaryDownload(
      loadingState("failure", "foreground"),
      { traceId: "new-primary" },
    )).toBe(false);
    expect(shouldInvalidateTerminalRevealForPrimaryDownload(
      outcomeState("success", "transcode"),
      { traceId: "new-primary" },
    )).toBe(false);
    expect(shouldInvalidateTerminalRevealForPrimaryDownload(
      outcomeState("success", "image"),
      { traceId: "new-primary" },
    )).toBe(false);
    expect(shouldInvalidateTerminalRevealForPrimaryDownload(
      { kind: "folder-outcome-visible", requestId: 1, status: "success", message: null, durationMs: 1400 },
      { traceId: "new-primary" },
    )).toBe(false);
    expect(shouldInvalidateTerminalRevealForPrimaryDownload(
      { kind: "task-processing", requestId: 1, source: "image" },
      { traceId: "new-primary" },
    )).toBe(false);
  });

  it("keeps typed three-way download semantics intact across both decisions", () => {
    for (const status of ["success", "failure", "cancelled"] as const) {
      expect(shouldInvalidateTerminalRevealForPrimaryDownload(
        outcomeState(status),
        { traceId: "new-primary" },
      )).toBe(true);
      // Visibility is kind-agnostic: any typed terminal shows when no
      // primary remains, and is suppressed while another primary remains.
      expect(shouldShowDownloadTerminalReveal(null)).toBe(true);
      expect(shouldShowDownloadTerminalReveal({ traceId: "another-primary" })).toBe(false);
    }
  });
});
