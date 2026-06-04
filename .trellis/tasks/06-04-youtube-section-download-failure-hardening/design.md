# Design: YouTube Section Download Failure Hardening

## Boundaries

This task changes the yt-dlp execution path for YouTube section downloads and the error summarization used when yt-dlp / ffmpeg fails. It does not change browser-extension IN/OUT capture, clip range validation, full-video downloads, or the downstream AE-friendly transcode queue.

Primary runtime files:

- `src/electron-runtime/ytDlpCommandPlan.ts`
- `src/electron-runtime/ytDlpDownload.ts`
- `src/electron-runtime/engineManifest.ts`
- `src/electron-runtime/processRunner.ts` only if exit-code normalization belongs at the command boundary
- Related tests under `src/electron-runtime/*.test.ts`

Spec cleanup may touch:

- `.trellis/spec/guides/video-download-patterns.md`
- `.trellis/spec/backend/sidecar-runtime-contracts.md`

## Current Flow

1. Browser extension sends `clipStartSec` and `clipEndSec` for YouTube.
2. Runtime validates the clip range and appends `--download-sections`.
3. YouTube always receives extended extractor args in the current implementation.
4. yt-dlp invokes ffmpeg internally to process section media.
5. On non-zero exit, runtime throws the last collected stderr line, which may be generic ffmpeg noise.

## Proposed Flow

1. Build the normal YouTube section command.
2. If it succeeds, behavior is unchanged.
3. If it fails and the command is a YouTube section download, classify whether a single conservative-format retry is appropriate.
4. Retry once with:
   - the same source URL
   - the same `--download-sections` range
   - the same cookies state unless a future requirement explicitly changes cookie policy
   - the same resolved CLI proxy URL, if available
   - a conservative same-tier selector biased toward direct HTTP(S) MP4/H.264 + M4A/AAC
5. If the retry fails, emit a terminal failure with an improved summarized error.

## Retry Mechanics

The current command plan is created once before execution, so the retry needs an explicit format-profile override. Preferred implementation shape:

- keep the resolved source URL, clip range, output stem, report paths, and cookie state from the initial `YtdlpCommandPlan`;
- let `runAttempt(...)` accept an attempt descriptor containing the format profile and retry label;
- let `buildYtdlpCommandArgs(...)` accept a format profile override, or build a shallow retry plan whose only changed field is `formatProfile`.

Each attempt should own its stderr collection. The final error summary should use the last failed attempt's stderr, while debug logs may include bounded per-attempt tails.

The retry must check `context.abortSignal.aborted` immediately before spawning the second yt-dlp process. Cancellation between first failure and retry must not start a new process.

## Proxy Handling

YouTube section downloads differ from ordinary yt-dlp downloads because yt-dlp delegates the selected remote media URLs to ffmpeg. A browser-visible YouTube page or a successful yt-dlp extraction does not prove that the ffmpeg child process can reach `googlevideo.com` through the user's network.

When a CLI-compatible HTTP(S) proxy can be resolved, yt-dlp commands should include `--proxy <normalizedUrl>`. yt-dlp's ffmpeg downloader then propagates that proxy into the ffmpeg process. This is especially important for users whose browser or Electron session can access YouTube through a configured proxy while standalone CLI child processes cannot.

Proxy resolution order:

1. Electron `session.resolveProxy(...)` for the target URL, which reflects system proxy, PAC, and Electron session proxy state.
2. HTTP(S) proxy environment variables such as `HTTPS_PROXY` / `HTTP_PROXY`.
3. Direct connection.

Automatically resolved SOCKS proxies should not be passed to the YouTube section ffmpeg path because the ffmpeg downloader path is HTTP-proxy oriented. Prefer documenting and diagnosing that case rather than adding a broad download fallback. Ameow no longer exposes or consumes manual global proxy configuration for this path.

## Partial Artifact Handling

Clip output templates do not include quality markers, so the retry would target the same final path as the first attempt. The retry implementation must prevent leftover first-attempt files from blocking or corrupting the retry.

Acceptable approaches:

- delete only retry-relevant partial artifacts before the second attempt, such as `.part`, `.ytdl`, `.f*` fragments matching the task prefixes; or
- use an attempt-specific temporary output template and normalize the successful retry output back to the expected final path.

The chosen approach must preserve normal final output naming and must still clean task artifacts after terminal failure.

## Conservative Same-Tier Selector

The selector should not downgrade quality intentionally. It should express the same quality target while preferring section/ffmpeg-friendly streams. For YouTube section retry, this includes preferring direct `http` / `https` protocol formats and avoiding DASH-like protocol variants where yt-dlp exposes them, because `--download-sections` delegates the selected media URLs to ffmpeg.

Examples:

- `balanced`: keep 1080p and `<=1080p` preference, but strongly prefer `avc1/mp4 + mp4a/m4a` before broader MP4 fallback.
- `best`: prefer best available MP4/H.264 + M4A/AAC when available, while avoiding a forced lower resolution cap.
- `data_saver`: preserve the existing low-data intent while preferring compatible MP4/M4A streams.

If no conservative selector can satisfy the site/video, the retry should fail instead of falling back to full-video download or a lower-tier cap.

## Error Summary

Introduce a small helper that converts collected stderr lines and exit status into a user-facing summary.

Filtering rules:

- Drop or deprioritize generic ffmpeg lines such as `Press [q] to stop, [?] for help`, `handler_name`, `vendor_id`, and metadata-only lines.
- Prefer lines containing actionable markers such as `ERROR:`, `Error`, `Failed`, `Invalid`, `HTTP Error`, `Requested format is not available`, `Conversion failed`, or `ffmpeg exited`.
- Keep a bounded tail for debug logs.
- When an ffmpeg exit code appears as a Windows unsigned 32-bit value, include the signed equivalent.

## Retry Scope

Retry eligibility should be narrow:

- site is YouTube
- clip range is present
- first attempt failed after spawning yt-dlp
- failure was not caused by user cancellation
- no previous section retry has been used for this task
- stderr does not clearly indicate a terminal page/video availability problem such as private/unavailable/404

The retry should not be a general auth recovery mechanism and should not fan out into multiple fallback attempts.

The retry should generally not depend on matching a specific ffmpeg error string. The reported `4294967158` is opaque, and yt-dlp/ffmpeg stderr changes across versions. The strict one-retry limit and unchanged quality/cookie/section semantics keep this bounded.

## Phase 2: Light / Extended Contract Alignment

Current code has residual `YouTubeMode` / `forceExtended` structures, but the runtime path is effectively always extended. Existing specs still describe a light-first contract. Planning must decide whether to align that mismatch inside this task or record it as a follow-up.

User decision: align the mismatch inside this task, in a separate phase, without reintroducing light mode.

Target contract:

- YouTube yt-dlp runtime uses the current extended-compatible extractor argument set.
- The codebase should not advertise an active light/extended switch where none exists.
- Spec text that says public/default YouTube starts in light mode should be revised to match executable behavior.
- Dead fields or tests for `forceExtended` / light-mode hints should be removed when they no longer affect runtime behavior.
- If a field is still needed for compatibility with older extension payloads, normalize it as ignored legacy input rather than an active behavior flag.

Cleanup candidates:

- `YouTubeMode` type in `ytDlpCommandPlan.ts`
- hardcoded `youtubeMode: "extended"` debug payloads if they imply a selectable mode
- schema/type fields for `extensionData.youtube.forceExtended` and `allowCookies`
- extension helpers/tests that still send `forceExtended: false` by default
- spec sections in `sidecar-runtime-contracts.md` and generated templates that describe light-first behavior

Compatibility stance:

- Prefer accepting old payloads without changing behavior over rejecting them.
- The UI/extension should stop emitting inactive mode hints once cleanup is complete.
- Runtime tests should assert current extended extractor args directly rather than through a mode abstraction.

## Rollback

The section retry can be disabled by removing the retry branch and returning to a single yt-dlp attempt. Error-summary improvements can remain independently because they do not alter download semantics.

Light/extended cleanup rollback is mostly additive documentation/type restoration. Keep behavior-preserving commits or patch sections separate enough that stale-contract cleanup can be reverted without reverting section failure hardening.
