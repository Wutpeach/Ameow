# Design

## Scope

Clean up the download chain by turning the browser/download quality choice into a product-level concept, migrating the wire payload off `ytdlp*`, and removing stale YouTube light-mode behavior.

## Current State

- The browser extension still emits `ytdlpQualityPreference`, while main/runtime code accepts several legacy shapes.
- Internal types and schemas still use `YtdlpQualityPreference`, even though the preference already flows through non-yt-dlp routes.
- YouTube mode handling still carries `light` and `extended`, but `light` can complete successfully with an underspecified result.
- Quality selection logic is currently concentrated in yt-dlp command planning, with site-specific selector behavior hidden in engine manifest data.

## Proposed Changes

### 1. Product-level quality preference

- Rename the internal concept to `VideoQualityPreference`.
- Introduce a normalized wire field such as `videoQualityPreference` for browser-extension and internal queue payloads.
- Keep legacy reads for `ytdlpQualityPreference`, `ytdlpQuality`, and `defaultVideoDownloadQuality` during migration only.
- Preserve accepted values:
  - `balanced`
  - `best`
  - `data_saver`
  - legacy aliases `high -> balanced` and `standard -> data_saver`

### 2. Backend behavior

- Treat quality preference as supported where a backend can actually choose formats.
- For unsupported routes, keep the preference in the normalized payload but do not pretend it was enforced.
- Do not add a permanent backend-capability abstraction yet; the migration should stay lightweight and concrete.

### 3. YouTube selection

- Remove the `light` execution path from YouTube download attempts.
- Use a single YouTube path based on the stronger extractor arguments already associated with `extended`.
- Keep the retry policy only for a genuinely retryable failure path if one remains after selector cleanup.
- Make the YouTube selectors express the approved semantics directly:
  - balanced: exact 1080p first, then `<=1080p`
  - best: highest available
  - data_saver: lowest available

## Boundaries

- Do not change direct-download routing.
- Do not change orchestrator fallback policy.
- Do not change the external download contract beyond the quality-field rename and compatibility reads.
- Do not introduce a new user-visible warning path for unsupported quality-aware backends in this pass.

## Data Flow

`browser extension payload -> normalized video quality preference -> queue/runtime intent -> backend-specific selector/behavior`

## Tradeoffs

- Renaming the wire field now removes the yt-dlp-specific framing, but it requires coordinated updates in browser-extension, main, and runtime code.
- Removing `light` makes the chain simpler and more predictable, but it gives up the old first-pass speed optimization.
- Keeping compatibility reads during migration avoids breaking older payloads, but those compat reads should be removed in a later cleanup task.

## Compatibility

- Existing payloads remain usable during the migration window.
- Legacy aliases and older field names must still normalize correctly.
- Non-quality-aware routes should continue to work without user-facing warnings.

## Rollback

- If the rename creates too much churn, revert the wire-field rename first while keeping the normalized internal type.
- If removing `light` causes unexpected regressions, reintroduce it only as an internal retry fallback, not as a user-facing semantic.
