# Design: Simplify and automate the Lab

## Boundaries

`lab.html` and `src/lab/lab-main.tsx` remain the only Lab entry. The Lab stays browser-only and depends inward on typed fixtures, pure production selectors/projections, and production presentation leaves. Production code must not depend on `src/lab/**`.

The implementation should reuse the existing `scenarios.ts`, `stateFixtures.ts`, `overlayProjection.ts`, preview stages, controls, and selectors where they already fit. No story framework, service layer, or generalized registry abstraction is needed.

## Scenario registry

Replace the duplicated Fullscreen lane and Compact preset selection with one finite discriminated registry. Each entry owns:

- a stable URL-safe ID and human label key;
- its real category/target (Fullscreen, Compact, or retained Ripple reference);
- the existing fixture factory or Compact preview pose/input needed to render it;
- only the small metadata actually consumed by the panel or capture runner.

The registry is the sole validation source for UI options and URL scenario IDs. Target is derived from the entry so `target` and `scenario` cannot disagree.

## URL and React state

At startup, parse an allow-listed query contract for `scenario`, `theme`, `reducedMotion`, and `capture`. Unknown values fall back to constants exported beside the parser. The selected registry entry and environment values seed React state.

Panel changes update the same state and serialize it with `history.replaceState` or `history.pushState`; they never assign `location.href` or navigate the document. A `popstate` listener, if retained for back/forward behavior, must clean up on unmount. URL helpers stay pure and receive `URLSearchParams`/values rather than reading globals directly so one focused test can cover parsing and serialization.

## Rendering and readiness

`PresentationLab` composes one selected registry entry:

- Fullscreen entries use the existing fixture/projection path and `LabOverlayStage` with production overlays/components.
- Compact entries use `CompactPreviewStage` and `CompactMascot`; pointer input remains Lab-local and browser-safe.
- Ripple remains an explicitly labelled migration reference and continues through its existing isolated renderer.

Wire the already-computed runtime-indicator visibility into the Lab host instead of adding another state authority. Queue and runtime actions remain safe no-ops or existing Lab-local state.

Capture mode removes panel/facts/backdrop/export chrome from layout but does not select a different fixture or renderer. The readiness marker is set only after the chosen entry is mounted and any required visual host reports its first capturable frame. Reduced Motion is the deterministic automation default unless the URL explicitly selects the supported alternative.

## Automation

Use the installed `playwright` package with one small Node smoke/capture script and built-in assertions; do not add a second test framework. The script starts or connects to an isolated Lab server, opens URL-selected scenarios, waits for the readiness marker, asserts the selected scenario identity, records navigation/request/page failures, and writes screenshots to an ignored or task-local output directory.

The first accepted capture run decides the PNG-export gate. If ordinary Playwright screenshots include the required DOM/WebGL result reliably, delete the old exporter and its readback-only surface as one unit. Otherwise keep it unchanged and record the exact gap in the task report.

## Removal boundaries

Remove Agentation only after current-source consumers are zero, then update `package.json` and the lockfile through npm. Remove the live OneWorks inspector/candidate path and its focused tests/packages, but do not modify archived task evidence or the production Compact/avatar-core path.

Ripple sources, asset, controls needed to reach the reference, and source-fidelity tests remain. Production Ripple migration is a separate task.

## Compatibility and rollback

- Production Electron and renderer build inputs remain unchanged.
- Existing `/lab.html?theme=white` behavior remains expressible in the new query contract.
- Unknown query values degrade to defaults rather than breaking old bookmarks.
- Changes can be rolled back by stage: registry/URL, obsolete-tool removal, capture automation, then conditional exporter removal. Do not combine the conditional exporter deletion with unrelated cleanup in one commit.
