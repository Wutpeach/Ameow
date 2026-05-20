# Professional full-project code review and fixes

## Architecture

This task now includes targeted fixes for the highest-value findings from the structured review.

The review will treat the repository as four primary risk surfaces:

1. `src/`: frontend state, orchestration, shared runtime contracts, and domain logic
2. `electron/`: desktop runtime, windowing, download execution bridge, filesystem/process integration
3. `browser-extension/`: browser-only capture, injection, routing, and extension-to-desktop contract logic
4. `scripts/` plus relevant root configs: build, packaging, runtime bootstrap, and release automation logic

## Review Method

- Start from repository structure, runtime entry points, and test topology to locate hotspots.
- Read project specs to anchor expected contracts and avoid style-only findings.
- Inspect representative high-risk modules first:
  - orchestration and runtime bridges
  - window state and event-driven flows
  - downloader/process execution logic
  - browser-extension background/content boundaries
  - scripts that can silently drift from runtime assumptions
- Use nearby tests to understand intended behavior and to spot contract gaps.
- Record only findings with a defensible behavioral, maintenance, or performance consequence.

## Severity Model

- `P0`: likely production-breaking or data-loss/security-level issue
- `P1`: high-risk defect or architecture flaw with meaningful user-facing failure potential
- `P2`: maintainability/readability/performance issue that meaningfully increases change risk or operational cost
- `P3`: lower-impact cleanup or localized smell worth addressing when touching the area

## Evidence Standards

- Every finding must cite concrete file/line evidence.
- Root cause must explain why the code got into a risky state:
  - duplicated responsibility
  - weak invariants
  - implicit cross-layer contract
  - missing failure-path handling
  - hidden coupling
  - poor naming/structure obscuring intent
  - unnecessary work on hot paths
- Tests may be cited as supporting context, but findings should point to production code unless the defect is specifically a testing gap.

## Boundaries

- Review live source and first-order configs only.
- Ignore generated outputs and dependency trees unless a checked-in artifact directly creates a runtime or maintenance risk.
- Treat docs and specs as contract references, not primary review targets.

## Risks

- Full-project scope can create shallow findings if not constrained; this is mitigated by hotspot-first review and severity filtering.
- Some issues may span multiple layers; those findings should be reported once at the owning boundary rather than duplicated.
- The codebase includes recent architectural migrations, so stale abstractions or duplicated pathways are likely and should be checked explicitly.

## Output Shape

The final response will:

1. list findings first, ordered by severity
2. include open questions/assumptions if needed
3. end with a short prioritized improvement plan

## Fix Design

### `video_selected_v2` Payload Preservation

- `browser-extension/background.js` already forwards `extensionData` as part of the injected video payload.
- `electron/main.mts` routes `video_selected_v2` through `buildVideoSelectedV2QueuePayload(...)`.
- `electron/videoDownloadCommands.mts` should include `extensionData` and `extension_data` in that queue payload builder so the existing runtime router can normalize it.
- Existing runtime normalization in `src/electron-runtime/commandRouter.ts` remains the contract boundary for shape validation.

### Dropped File Memory Bound

- `src/App.tsx` already has a shared `saveDroppedFilesToOutput(...)` helper used by several drop paths.
- The duplicated manual `arrayBuffer -> reduce -> btoa` fallback should be replaced by that helper.
- The helper should use `FileReader.readAsDataURL(...)` for browser-file fallback and refuse oversized pathless files instead of blocking the renderer on large byte-string construction.

## Validation Design

- Extend `electron/videoDownloadCommands.test.mts` for `extensionData` preservation in `buildVideoSelectedV2QueuePayload(...)`.
- Run focused Electron bridge tests.
- Run type-check and lint after implementation.
