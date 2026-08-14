import type { CenterOverlayState } from "../../utils/centerOverlayState";
import type { ExpandedPresentationTerminalTarget } from "./expandedPresentationTargets";

// MR4 Terminal Reveal — pure Presentation projection.
//
// Maps the CURRENT center-outcome Presentation state and the current primary
// DOWNLOAD to one bounded Expanded Presentation terminal target. It is a pure
// current state value, not a state machine and not a second store:
// recomputing it from one snapshot never depends on animation history, and it
// contains no terminal classification, trace, retention, lifecycle command,
// or per-frame data. The typed outcome kind was classified by the Download
// feature; App marks it with `origin: "terminal"` and maps it into the center
// overlay. This projection only reuses that presentation status for graphics
// consumption — it never infers a terminal from status/source/message.
//
// Rules (mirror the MR0 terminal-target contract and the approved MR4
// semantics):
//   - a current primary DOWNLOAD wins immediately: the lane is invalidated
//     (none), never hidden-and-retained. A Transcode primary is NOT an MR4
//     interruption rule — the center overlay may visually prioritize
//     Transcode independently (selectCenterOverlayVisual), but the terminal
//     target interruption semantics are Download-only;
//   - only outcomes with `source: "download"` AND `origin: "terminal"`
//     project (typed terminal transitions only; generic enqueue/command
//     failures, image/file tasks, and transcode events stay on their
//     existing presentation paths and never seed this target);
//   - the outcome loading and visible phases both project (the semantic
//     target is available before the shell finishes expanding; the renderer
//     waits for its own eligibility and reconstructs from this target).

/**
 * Resolves the projected Expanded Presentation terminal target from the current
 * center outcome Presentation state and the current primary Download.
 *
 * - current primary Download exists    -> none (current download wins)
 * - no primary download, terminal      -> terminal(success | failure | cancelled)
 * - no primary download, other outcome -> none
 * - no primary download, no outcome    -> none
 */
export const resolveDownloadTerminalTarget = (
  centerOverlayState: CenterOverlayState,
  primaryDownloadTask: { traceId: string } | null,
): ExpandedPresentationTerminalTarget => {
  if (primaryDownloadTask !== null) {
    return { kind: "none" };
  }
  if (
    centerOverlayState.kind !== "task-outcome-loading"
    && centerOverlayState.kind !== "task-outcome-visible"
  ) {
    return { kind: "none" };
  }
  if (
    centerOverlayState.source !== "download"
    || centerOverlayState.origin !== "terminal"
  ) {
    return { kind: "none" };
  }
  return { kind: "terminal", status: centerOverlayState.status };
};

/**
 * MR4 App-level decision: should a just-arrived download terminal create
 * Reveal Presentation state? The caller passes the EXACT post-reduction
 * primary Download the DownloadQueueController handed to the terminal
 * listener — captured synchronously after terminalReceived reduced the
 * authoritative fact, so no React commit timing can lag it. terminalReceived
 * has already pruned the terminal's own trace, so a non-null primary can
 * never legitimately be the same terminal: any remaining primary is
 * necessarily "another" download, and a background terminal must not create
 * center outcome state, retention timer, or centerOutcome lock. Only a null
 * primary shows the just-arrived terminal (normal foreground terminal).
 */
export const shouldShowDownloadTerminalReveal = (
  postReductionPrimaryDownload: { traceId: string } | null,
): boolean => postReductionPrimaryDownload === null;

/**
 * MR4 App-level decision: should a NEW current primary Download invalidate a
 * lingering terminal Reveal Presentation immediately (state, retention timer,
 * and centerOutcome lock) — including before the new download's first
 * progress event? Only typed terminal Presentations (`origin: "terminal"`,
 * `source: "download"`) match; folder, image, transcode, and generic
 * enqueue/command outcomes are untouched by MR4 invalidation semantics.
 */
export const shouldInvalidateTerminalRevealForPrimaryDownload = (
  centerOverlayState: CenterOverlayState,
  currentPrimaryDownload: { traceId: string } | null,
): boolean => {
  if (currentPrimaryDownload === null) {
    return false;
  }
  return (
    (centerOverlayState.kind === "task-outcome-loading"
      || centerOverlayState.kind === "task-outcome-visible")
    && centerOverlayState.source === "download"
    && centerOverlayState.origin === "terminal"
  );
};
