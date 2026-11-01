# Design

## Boundary

This task extends the existing renderer-side event reducer boundary introduced in Phase 4. The reducer module owns plain calculations from previous view state plus event payload to next view state. `src/App.tsx` continues to own event subscription, React setter invocation, pending action cleanup, user-visible notices/outcomes, timers, refs, and desktop bridge calls.

## Data Flow

```text
desktop event payload
  -> App event callback
  -> reducer helper normalizes task payload
  -> reducer helper returns next detail/progress data or null
  -> App applies returned data through existing React setters
  -> App performs existing side effects in the same callback
```

## Contracts

- Reducer helpers accept `Partial<VideoTranscodeTaskPayload> | null | undefined` to match the existing normalization helper contract.
- Reducer helpers return `null` for invalid or missing payloads, preserving the existing early-return behavior in `App.tsx`.
- Reducer helpers return only serializable/plain data:
  - `VideoTranscodeQueueDetailPayload`
  - `TranscodeProgressByTrace`
  - failed-event `errorSummary`
- Reducer helpers must not import React, desktop runtime modules, i18n, timers, or Electron APIs.

## Event Handling

- Queued: upsert the normalized task into detail.
- Retried: upsert the normalized task into detail and remove stale progress for that trace.
- Removed: remove the trace from detail and progress.
- Failed: upsert the normalized task into detail, remove stale progress for that trace, and expose a plain summarized error string for App to use with the existing foreground outcome fallback.

## Compatibility

- Existing event names and payload shapes remain unchanged.
- Existing App side-effect ordering remains recognizable:
  - pending action cleanup still runs in retried/removed/failed callbacks after payload validation.
  - failed outcome and queue notice still run in the failed callback.
  - translation fallback for failed outcome remains in App.
- Existing progress reference preservation behavior remains:
  - progress removal returns the previous object when the trace does not exist.

## Trade-offs

- The helpers duplicate the event names conceptually but avoid a generic action reducer. This keeps Phase 4.5 reviewable and avoids changing state ownership.
- The failed helper returns `errorSummary` as data, but App still decides visible fallback copy and duration.
