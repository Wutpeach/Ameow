# Design: Editing-Compatible Post-Processing Observability

## Scope

In scope:

- Add bounded instrumentation around yt-dlp profile selection and compatibility follow-up decisions.
- Add tests for the instrumentation and probe-failure boundary.
- Preserve current output semantics and event ordering.

Out of scope:

- Changing `best`, `balanced`, or `data_saver` selectors.
- Preferring complete MP4 over split-stream formats.
- Moving `video-download-complete` after compatibility normalization.
- Adding a new output mode.

## Current Flow

```text
request
  -> site/provider intent
  -> yt-dlp command profile
  -> network download
  -> yt-dlp/ffmpeg mux when needed
  -> source media complete event
  -> ffprobe/ffmpeg probe
  -> skip or enqueue compatibility transcode queue
```

The prior task improved tests and UI copy, but it did not provide enough runtime evidence to answer:

- which selector/profile was active for a slow case;
- whether the slow local step was required mux, remux, audio transcode, full transcode, or probe failure;
- how often `balanced` already lands on `MP4 + H.264 + AAC` and skips downstream work.

## Candidate Evidence Points

Prefer existing runtime logging or `DownloadTrace` style infrastructure if available. If no structured trace path exists for this exact data, add compact log events with the existing backend log style.

Suggested evidence fields:

- `traceId`
- `siteId` or provider id when available
- `qualityPreference`
- yt-dlp profile name or merge output format
- bounded selector metadata, such as selector profile key rather than the full selector string if the full string is noisy
- final source extension/container summary
- video codec and audio codec from probe
- compatibility decision
- probe error summary when probe fails

Avoid:

- cookies;
- full command lines containing sensitive paths;
- long raw URLs;
- large ffprobe JSON blobs.

## Probe-Failure Policy

Current behavior:

- If both ffprobe and ffmpeg fallback probe fail, `prepareVideoTranscodeTaskFromDownload(...)` preserves a conservative `full_transcode` fallback.

Recommended first implementation:

- Preserve the conservative fallback.
- Add a bounded warning/evidence event that clearly labels it as `probe_failure_full_transcode`.
- Do not introduce extension-based skip heuristics yet. A `.mp4` extension does not prove codec compatibility.

## Validation Strategy

- Unit tests should mock or exercise helper-level decisions without invoking real yt-dlp downloads.
- Existing service tests can be extended only if the instrumentation crosses the service boundary.
- Avoid tests that rely on exact wall-clock duration.
- If elapsed-time evidence is added, inject a clock or assert only presence/classification, not exact values.

## Risks

- Logging too much can expose URLs, paths, or cookies.
- Logging too little will not answer why a user waited after download reached 100%.
- Probe failures can be caused by missing ffprobe/ffmpeg, damaged files, transient filesystem issues, or unsupported media. Treat them distinctly where practical, but keep compatibility conservative.
- Selector changes remain tempting but should wait until this task can produce evidence from representative Bilibili/YouTube samples.
