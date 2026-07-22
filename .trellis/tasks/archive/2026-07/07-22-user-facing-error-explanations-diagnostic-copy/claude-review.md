# Claude Review

## Summary

Claude reviewed the PRD/design/implement plan for localized center-prompt error explanations and diagnostic JSON copy.

Overall verdict: the architecture is sound, but the implementation plan needed more concrete wiring details around structured failure payloads, cancellation-vs-failure state, center overlay props, main-process command registration, and transcode classification.

## Must-fix issues identified

- Structured `DownloadRuntimeError` data is currently discarded before the renderer; download completion emit sites need to include structured failure details, not only `runtimeError.message`.
- Original user URL is available on the active request but not forwarded to the renderer; add it to the structured failure payload rather than using a retained lookup map.
- The renderer currently conflates non-success with cancellation in the video download completion handler; use `outcome.cancelled` instead of `!outcome.success`.
- Transcode failure currently hardcodes the foreground outcome as `cancelled: true`; real transcode failures must be distinct from user cancellation.
- `ForegroundOutcomeOverlay` props cannot express the new copy action and real-failure state; it needs a `showCopyAction`/callback path and carefully scoped pointer events.
- `showForegroundTaskOutcome` needs to carry optional failure diagnostic data through center overlay state to the overlay component.
- `copy_error_diagnostics` must be added to `AmeowRendererCommand`, registered in main-process command routing, and implemented with Electron clipboard.
- Transcode failures lack structured classification; add a lightweight transcode failure diagnostic/category path instead of letting all transcode failures fall into unclassified.
- Existing `ForegroundOutcomeOverlay` renders error text only when `cancelled`; after this task, real failures need their own visible error text and copy icon path.

## Recommended adjustments adopted

- Add optional `failure` details and original `url` to failure payloads where practical.
- Treat cancellation and real failure as separate center outcome states.
- Add explicit data flow through `showForegroundTaskOutcome` -> center overlay state -> `ForegroundOutcomeOverlay`.
- Build diagnostic JSON with a pure builder function that can be unit tested independently from clipboard writing.
- Use main-process clipboard command for runtime log read, redaction, JSON generation, and clipboard write.
- Add a lightweight transcode failure category path for MVP.
- Verify the 5-second failure timer is cleared by existing transient-overlay dismissal when new foreground task progress starts.

## Test recommendations

- Diagnostic JSON parses and matches the expected schema.
- Redaction removes cookies, authorization headers, bearer tokens, token/password/session-like fields, while preserving original URLs.
- Internal error codes and common upstream stderr patterns map to the approved MVP categories.
- `E_ABORTED` / user cancellation does not show diagnostic copy UI.
- Download and transcode event handlers preserve cancellation-vs-failure distinction.
- Center prompt text and copy icon fit in zh-CN and en.
- Runtime log unavailable path still copies JSON with an explanatory placeholder.
- New progress interrupts an existing 5-second failure prompt.
- `npm run locales:sync`, `npm run type-check`, `npm run lint`, and `npm run docs:build` pass.

## Notes

- Claude referred to "all 15 error codes"; the current `src/core/constants/error-codes.ts` list contains 14 codes. Implementation should test the current source of truth rather than the review count.
