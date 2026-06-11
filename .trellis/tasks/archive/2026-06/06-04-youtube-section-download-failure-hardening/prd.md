# Harden YouTube section download failures

## Goal

Improve YouTube section-download failure behavior without changing the core product promise: when the user selects IN/OUT points, Ameow should download only that selected section through `yt-dlp --download-sections`, not download the full video and crop locally.

The task should make failures easier to diagnose and add one narrow retry path for section-download format fragility while preserving honest terminal failures when the downloader cannot produce the requested section.

## Background / Confirmed Facts

- YouTube section downloads are currently planned by adding `--download-sections "*HH:MM:SS(.mmm)-HH:MM:SS(.mmm)"` in `src/electron-runtime/ytDlpCommandPlan.ts`.
- User testing showed both cookie-backed and cookie-free YouTube section downloads can reach the section download phase successfully. Cookies are therefore not the primary confirmed cause of the reported `ffmpeg exited with code 4294967158` failure.
- Affected user testing after deleting managed runtimes and re-extracting both desktop app and browser extension still fails for YouTube section downloads with the same ffmpeg exit code, while Bilibili section downloads work. This makes a broken ffmpeg installation unlikely and points toward YouTube-specific ffmpeg remote media fetching, especially proxy/network handling for `googlevideo.com` URLs.
- The observed `Press [q] to stop, [?] for help` terminal error is a poor stderr summary, not a real root cause. Current runtime behavior can surface the final non-empty stderr line even when it is generic ffmpeg console text.
- `4294967158` is a Windows unsigned representation of a negative ffmpeg exit status; displaying it raw is not useful.
- Current implementation effectively runs YouTube in extended mode for all YouTube yt-dlp invocations. Light/extended request fields and spec text still exist, but the runtime does not currently perform light/extended mode switching.
- Full-video download followed by local crop is explicitly out of scope because it violates the feature intent.
- User confirmed this task should also clean up and align the stale light/extended YouTube contract in phases. The target is to align docs/code with current extended-only runtime behavior, not to reintroduce light mode.

## Requirements

- Keep YouTube section downloads on the `yt-dlp --download-sections` path.
- Do not add a full-video-download-then-local-crop fallback.
- Do not add quality downgrade fallback. A retry must preserve the user's requested quality tier intent.
- Add at most one section-download retry for YouTube when the first attempt fails in a way consistent with section/ffmpeg format fragility.
- The retry, if used, must still be a section download and should use a conservative format selector that prefers MP4/H.264 video with M4A/AAC audio where available.
- Retry eligibility should be broad but bounded: YouTube section download, not cancelled, not already retried, and not clearly a terminal video/page availability failure such as private/unavailable/404.
- Improve yt-dlp / ffmpeg error summarization so UI and logs do not report generic lines such as `Press [q] to stop` as the root cause.
- Normalize or annotate Windows unsigned ffmpeg exit codes such as `4294967158` so the error is understandable.
- Preserve existing successful YouTube section downloads, with and without cookies.
- yt-dlp executions should receive a CLI-compatible proxy explicitly when one can be resolved automatically from the Electron/system proxy environment or HTTP(S) proxy environment variables, so YouTube section downloads can pass the same proxy through to the internal ffmpeg downloader path.
- The Settings UI should not ask users to configure proxy details for this path; proxy troubleshooting belongs in docs, while the app should use system/network proxy state automatically where possible.
- Clean up and align stale YouTube light/extended contract remnants in this task:
  - remove or retire dead runtime types/helpers that imply active light/extended switching;
  - update specs that currently describe light-first behavior;
  - remove or de-emphasize extension/runtime fields such as `forceExtended` where they no longer have executable meaning;
  - preserve the current effective YouTube extractor behavior unless a removed field is proven to still be consumed by a supported path.

## Out Of Scope

- Full download followed by local crop.
- Quality downgrade retry, such as balanced to 720p/480p.
- Broad multi-stage fallback chains.
- Reintroducing YouTube light/extended extractor switching unless explicitly scoped back in.
- Changing Bilibili section download behavior except for shared error-summary helpers if reused.

## Acceptance Criteria

- [ ] YouTube section download still emits `--download-sections` for valid clip ranges.
- [ ] A failed YouTube section download may retry at most once with a conservative same-tier format profile.
- [ ] The retry does not remove the clip range and does not download the full video for later local cropping.
- [ ] The retry does not intentionally downgrade the user's requested quality tier.
- [ ] Retry attempts isolate stderr and partial output artifacts so the second attempt is not polluted by the first attempt's logs or residue.
- [ ] yt-dlp / ffmpeg failure summaries filter generic ffmpeg console/status noise and prefer actionable error lines.
- [ ] Raw Windows unsigned ffmpeg exit codes are normalized or annotated in the displayed/logged error.
- [ ] Manual cancellation is still treated distinctly from ordinary download failure where current cancellation state is available.
- [ ] Tests cover section retry command construction and stderr summary behavior.
- [ ] Existing non-section YouTube download behavior remains unchanged unless explicitly approved during planning.
- [ ] Stale light/extended YouTube runtime/spec contracts are aligned with current extended-only behavior.
- [ ] Any removed extension/runtime fields have tests updated or removed so the contract no longer advertises inactive behavior.

## Planning Decision

- Include light/extended cleanup in this task as a second phase after section failure hardening planning.
- Do not restore light mode as part of this task.
- Section retry takes priority over cookie-policy retry for this task. Cookie switching is not part of the planned retry chain unless requirements change.
