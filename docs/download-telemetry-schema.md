# Download Telemetry Schema

Source of truth:
- `src/download-capabilities/telemetry.ts`

Current event type:
- `download_outcome`

Current schema version:
- `1`

## Fields

Each JSONL line is one `download_outcome` event with:

- `schemaVersion`: integer version of the line schema
- `eventType`: currently always `download_outcome`
- `recordedAt`: ISO datetime
- `traceId`: download trace identifier
- `siteId`: resolved site identity
- `providerId`: resolved provider identity
- `interactionMode`: `paste | drag | context_menu | injected_button | page_bridge | unknown`
- `engineChain`: ordered engine list considered for the request
- `chosenEngine`: engine actually executed for the final outcome, or `null`
- `outcome`: `success | failure`
- `errorCode`: runtime error code, or `null`
- `errorClassification`: classified failure category, or `null`
- `errorMessage`: human-readable error summary, or `null`
- `downloadProfile` (optional): downloader-side format evidence for yt-dlp-backed plans
  - `qualityPreference`: requested quality tier, normalized to `best | balanced | data_saver`
  - `ytdlpProfileKey`: bounded profile key such as `default` or `youtube`, or `null`
  - `ytdlpMergeOutputFormat`: merge output profile such as `mp4` or `mp4/mkv`, or `null`
  - `ytdlpFormatSort`: bounded yt-dlp format-sort profile, or `null`
- `compatibility` (optional): post-download editing-compatibility evidence for successful source media when available
  - `sourceExtension`: source file extension without a path, or `null`
  - `containerNames`: bounded list of probed container names
  - `videoCodec`: probed video codec, or `null`
  - `audioCodec`: probed audio codec, or `null`
  - `decision`: `skip_compatible | remux_only | audio_transcode | full_transcode | probe_failure_full_transcode | null`
  - `probeFailed`: whether media probing failed before the conservative fallback
  - `probeErrorSummary`: bounded probe failure summary, or `null`

## Stability Rules

- Adding a new optional field is backward-compatible and does not require a schema version bump.
- Renaming a field, removing a field, or changing the meaning/type of an existing field requires a schema version bump.
- Report generators must read and preserve `schemaVersion` before interpreting lines.
- New consumers should validate each line against `downloadTelemetryEventSchema` instead of assuming shape.

## Reporting Contract

Current local report outputs should be derived from:
- total success / failure counts
- per-site success rates
- auth-required hotspots
- high-risk site/engine combinations

If future reports need more dimensions, prefer adding optional fields first and keeping the existing fields stable.
