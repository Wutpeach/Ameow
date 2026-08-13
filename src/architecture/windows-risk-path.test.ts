import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * MR0 Windows risk path regression gates (Slice 6).
 *
 * Both observed Windows issues are reachable repair dependencies; replacing
 * Reveal/Progress visuals does NOT remove either chain. These static gates pin
 * the exact links of each chain so any future change that would repair or
 * remove a link must be deliberate and re-validated. The gates never claim an
 * issue is solved — they only assert the chains still exist and keep their
 * argument-conversion and terminal-hold shapes.
 *
 * Risk A (native argument conversion / compact reachability):
 *   src/App.tsx (presentationDependencies -> ensureMainWindowCompactReachable)
 *   -> src/desktop/runtime.ts (currentWindow passthrough)
 *   -> electron/preload.mts (ipcRenderer.invoke/send with the request object)
 *   -> electron/main.mts (ensure-compact-reachable / set-position handlers,
 *      Number() conversion with NaN guards)
 *   -> electron/mainWindowSurfacePolicy.mts (resolveCompactReachablePosition /
 *      interpolatePosition -> win.setPosition)
 *
 * Risk B (terminal window remains full):
 *   terminal event -> App.tsx onDownloadTerminal -> showForegroundTaskOutcome
 *   -> src/utils/centerOverlayState.ts (request-id/timer policy)
 *   -> App.tsx presentation locks (centerOutcome lock projection)
 *   -> lifecycle.ts setLock(false) -> collapsePending -> single-ack compact
 */

const repoRoot = path.resolve(import.meta.dirname, "..", "..");

const read = (relative: string): string =>
  readFileSync(path.join(repoRoot, relative), "utf8");

describe("MR0 Windows risk A: native argument conversion chain", () => {
  it("link 1: App projects the compact-reachability request with numeric arguments", () => {
    const app = read("src/App.tsx");
    expect(app).toContain("ensureMainWindowCompactReachable(");
    expect(app).toContain("reachableFrameSize:");
    expect(app).toContain("edgePadding:");
    expect(app).toContain("requestEpoch,");
    // The request crosses the bridge as plain numeric data, not DOM/native refs.
    expect(app).toContain("getMainWindowCompactOuterSize(");
  });

  it("link 2: desktop runtime passes the request to the Electron bridge", () => {
    const runtime = read("src/desktop/runtime.ts");
    expect(runtime).toContain("currentWindow.ensureMainWindowCompactReachable(options)");
    expect(runtime).toContain("currentWindow.setPosition(position)");
    expect(runtime).toContain("currentWindow.setInteractionMode(mode)");
  });

  it("link 3: preload crosses the IPC boundary with the request object", () => {
    const preload = read("electron/preload.mts");
    expect(preload).toContain(
      'invoke("ameow:current-window:ensure-compact-reachable", options)',
    );
    expect(preload).toContain(
      'ipcRenderer.send("ameow:current-window:set-position", position)',
    );
    expect(preload).toContain(
      'ipcRenderer.send("ameow:current-window:set-interaction-mode", { mode })',
    );
  });

  it("link 4: Main converts arguments with Number() and NaN guards", () => {
    const main = read("electron/main.mts");
    expect(main).toContain('"ameow:current-window:ensure-compact-reachable"');
    expect(main).toContain('"ameow:current-window:set-position"');
    expect(main).toContain("Number(payload?.x)");
    expect(main).toContain("Number.isNaN(x)");
    expect(main).toContain("Number(request?.reachableFrameSize)");
    expect(main).toContain("Number.isFinite(reachableFrameSize)");
    expect(main).toContain('"ameow:current-window:set-interaction-mode"');
  });

  it("link 5: native policy owns position-only compact reachability", () => {
    const policy = read("electron/mainWindowSurfacePolicy.mts");
    expect(policy).toContain("resolveCompactReachablePosition");
    expect(policy).toContain("interpolatePosition");
    expect(policy).toContain("win.setPosition(");
    expect(policy).toContain("ensureMainWindowCompactReachable");
    // Position-only: the policy never resizes the window.
    expect(policy).not.toContain("win.setSize(");
    expect(policy).not.toContain("win.setBounds(");
  });

  it("documents the repair dependency: no visual replacement claim exists in MR0 artifacts", () => {
    // The chain is renderer-bridge-native and independent of M3 visuals; the
    // gate keeps it reachable until an approved repair changes these exact
    // paths. Asserting presence is the gate — absence would require a review.
    expect(
      read("src/App.tsx") + read("src/desktop/runtime.ts")
      + read("electron/preload.mts") + read("electron/main.mts")
      + read("electron/mainWindowSurfacePolicy.mts"),
    ).toMatch(/ensureMainWindowCompactReachable/);
  });
});

describe("MR0 Windows risk B: terminal-not-compact chain", () => {
  it("link 1: terminal event dispatches into the bounded outcome opportunity", () => {
    const app = read("src/App.tsx");
    expect(app).toContain("onDownloadTerminal(");
    expect(app).toContain("showForegroundTaskOutcome(");
    expect(app).toContain("durationMs:");
    expect(app).toContain("beginTaskOutcomeLoading");
  });

  it("link 2: center overlay owns request-id/timer policy for the hold", () => {
    const overlay = read("src/utils/centerOverlayState.ts");
    expect(overlay).toContain("requestId");
    expect(overlay).toContain("finishTaskOutcome");
    expect(overlay).toContain("beginTaskOutcomeLoading");
    expect(overlay).toContain("dismissTransient");
  });

  it("link 3: App projects the centerOutcome lifecycle lock from overlay policy state", () => {
    const app = read("src/App.tsx");
    expect(app).toContain("centerOutcome: centerOverlayLockActive");
    expect(app).toContain("isCenterOverlayLockActive(");
  });

  it("link 4: lifecycle lock release feeds the normal collapse path", () => {
    const lifecycle = read("src/presentation/main-window/lifecycle.ts");
    expect(lifecycle).toContain('{ type: "setLock"; lock: MainWindowPresentationLock; active: boolean }');
    expect(lifecycle).toContain("beginCollapseDelay");
    expect(lifecycle).toContain("collapsePending");
    expect(lifecycle).toContain("visualTransitionCompleted");
    // Compact is entered only by the matching collapse completion; the
    // non-full branch of the same event settles compact + passthrough.
    expect(lifecycle).toContain('event.target === "full"');
    expect(lifecycle).toContain('mode: "compact-passthrough"');
  });

  it("keeps both chains unclaimed as solved by MR0", () => {
    // No MR0 artifact may state either issue is fixed by this phase; the
    // gates exist to keep the repair dependencies visible.
    const plan = read(".trellis/spec/frontend/motion-guidelines.md")
      + read(".trellis/spec/frontend/state-management.md");
    expect(plan).not.toMatch(/Windows (issue|risk).{0,60}(fixed|solved|resolved)/i);
  });
});
