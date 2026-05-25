# Design

## Boundary

Create one renderer-side helper module for download/transcode view helpers currently embedded in `src/App.tsx`.

The module owns deterministic transformations only:

- formatting download/transcode status text from payload fields
- formatting ETA clock text
- advancing download stage for display
- normalizing queue state/detail payloads
- normalizing, sorting, merging, and displaying transcode queue tasks
- clamping display progress percentages

The module must not own:

- React state
- refs
- timers
- Electron bridge calls
- event subscription lifecycle
- foreground outcome display
- queue notice timers
- runtime dependency gate behavior

## Translation Contract

Existing App helpers call `i18n.t("desktop:...")`. The extracted module will accept a small translation function argument for helpers that need localized text. This keeps the helpers testable and avoids coupling the helper module to the global i18n singleton.

The `App` component will call these helpers with a translation wrapper that delegates to `i18n.t`, preserving the existing key names and namespace-qualified strings.

## Compatibility

No public types, event names, IPC commands, WebSocket actions, or payload fields change. The helper module imports existing payload types from `src/types/videoRuntime.ts`.

## Testing

Add focused Vitest coverage for:

- `advanceDownloadStage`
- `getDownloadStatusText`
- `normalizeVideoQueueState`
- `normalizeVideoQueueDetail`
- `normalizeVideoTranscodeQueueState`
- `normalizeVideoTranscodeQueueDetail`
- `upsertVideoTranscodeTask`
- `removeVideoTranscodeTask`
- `mergeVideoTranscodeTask`
- `getTranscodeTaskStatusText`
- `getVideoTranscodeTaskProgressPercent`
- `getVideoTranscodeFormatLabel`

Tests use a fake translator that returns readable keys/options so behavior can be asserted without initializing i18n.

## Rollback

If tests reveal behavior ambiguity or the extraction needs event/state changes, revert the helper extraction and stop the phase. Event folding belongs to Phase 4, not this task.
