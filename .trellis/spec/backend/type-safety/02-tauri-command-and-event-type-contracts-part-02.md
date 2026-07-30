## Scenario: Tauri Command and Event Type Contracts

_Part 2 of 2._

### 5. Good / Base / Bad Cases

- Good:
  - `export_support_log` returns the generated file path as `String`, writes a sectioned summary log, and still succeeds when downloader probing falls back to placeholder text.
  - Rust and TypeScript contracts are changed together; `check_ytdlp_version` still exposes `updateAvailable` on frontend and keeps `current` available when remote lookup fails.
  - `video-download-complete` payload always includes `success`, with `file_path`/`error` optional.
  - A Pinterest drag payload with a valid primary `url`, canonical `pageUrl`, and both MP4 + manifest hints keeps only validated video assets and orders the direct MP4 first.
  - A yt-dlp finalization line such as `Embedding metadata` or `Deleting original file` advances the UI into `post_processing` instead of disappearing as parser noise.
  - A YouTube/Bilibili clip download advances from resolving to downloading on the section-start line, then updates percent from ffmpeg `time=` progress while the clip is being fetched.
  - Missing rename key still yields deterministic behavior: keep source name when available.
  - Rename-disabled yt-dlp full-video output uses `<title>[<width>x<height>][<quality>]` so `highest`, `balanced`, and `data-saver` can coexist for the same source title.
  - Reset command clears `renameSequenceCounters` and returns `Ok(true)`.
  - `prefix_number` + prefix/suffix generates `<prefix>_<num>_<suffix>.<ext>` when both affixes are non-empty.
  - Clip output naming uses `<startMs>-<endMs>_<title>` when rename is disabled.
  - Browser extension sends canonical YouTube/Bilibili current-item URLs and runtime keeps the request in single-item mode.
  - A pasted YouTube/Bilibili page URL without `title` still settles to a human-readable video title when yt-dlp metadata can provide one before download starts.
  - A pasted YouTube/Twitter-X/Bilibili/Douyin/Pinterest/Xiaohongshu URL on a supported injected-button site resolves through the extension and enqueues the same current-item payload shape as clicking the injected button on that page.
- Base:
  - Support-log export writes the file under the app config tree and returns its path without extra metadata.
  - Existing command keeps same shape; only implementation changes internally.
  - Support-log summary excludes theme/language while keeping download-diagnostic settings.
  - Optional fields remain optional and callers branch on presence.
  - A request with a valid primary `url` but invalid `pageUrl` / `videoUrl` still queues after dropping those untrusted hints.
  - GitHub latest lookup can fall back to cached/stale data or `null` without breaking the whole settings view.
  - Image/video source filename unavailable falls back to sequence naming without panic.
  - Empty suffix keeps `<num>.<ext>` or `<prefix>_<num>.<ext>` (no trailing underscore).
  - Older `video_selected_v2` payloads without `selectionScope` continue to work with existing auto behavior.
- Bad:
  - `export_support_log` starts returning `{ path: string }` while frontend still expects `string`.
  - Rust renames field without serde alias and frontend still reads old key.
  - `check_ytdlp_version` returns `Err(...)` on GitHub rate limit even though `current` was already resolved successfully.
  - Frontend assumes `file_path` always exists when `success` is false.
  - New command added with untyped `invoke("...")` and unchecked cast.
  - Different download paths implement different defaults for the same rename setting.
  - One download path ignores preset and still forces ascending sequence.
  - `precise` silently downgrades to `libx264` after hardware probe failure.
  - Clip output falls back to opaque cache-like name (`src-<hash>.mp4`) in user output directory.
  - A YouTube `watch?v=...&list=...` player click still triggers playlist pagination instead of the selected current video.
  - A pasted YouTube/Bilibili URL skips metadata-title probing and falls straight back to `watch` / `BV...` even though yt-dlp could have resolved the title before download.
  - A `blob:` / `javascript:` Pinterest drag URL is accepted as the queued primary `url`.
  - A Pinterest page URL or image URL survives normalization as `videoUrl` and incorrectly overrides the provider/orchestrator path as if it were a real media asset.
  - A yt-dlp `Embedding metadata` line is ignored, so the UI never enters `post_processing`.

### 6. Tests Required (with assertion points)

- Type contract assertions:
  - `pnpm exec tsc --noEmit` (or project equivalent) passes after command/payload changes.
  - No new `any` introduced for command results/events.
- Runtime contract assertions:
  - Trigger `export_support_log` and assert the returned string path exists on disk.
  - Queue a pasted YouTube or Bilibili page URL without `title` and assert runtime probes yt-dlp metadata before output-stem allocation, producing a title-based stem instead of `watch` / `BV...` when metadata succeeds.
  - Make the log directory unavailable and verify the command returns `Err(String)` with filesystem context.
  - Force downloader probing to fail and verify `export_support_log` still writes a file containing placeholder text.
  - Verify exported content contains the `environment`, `settings`, `downloaders`, and `runtime_evidence` sections.
  - Verify exported content includes bundled downloader/runtime diagnostic metadata such as `gallery-dl` and `deno_path=...`, and omits a raw pretty-printed full config snapshot.
  - Verify exported settings summary includes download-diagnostic fields and omits theme/language.
  - Verify runtime evidence keeps warning/error and route/terminal breadcrumbs while dropping high-frequency progress noise.
  - Force GitHub latest lookup to fail and verify `check_ytdlp_version` still returns local `current` with `latest=null` and `latestError` populated.
  - Trigger one successful and one failed video download; verify `video-download-complete` payload is consumed without crashes.
  - Run yt-dlp version check and verify frontend reads `updateAvailable` / `latestError` exactly.
  - Remove both rename keys from config and verify first image/video download prefers source naming.
  - Use legacy-only `videoKeepOriginalName` config and verify naming behavior matches previous expectation.
  - Enable rename mode with missing preset key and verify first renamed output starts from `99`.
  - Set preset to `asc_number` and verify renamed outputs increase from `1`.
  - Set preset to `prefix_number` with suffix empty and verify no empty `_` segment in filename.
  - Set prefix/suffix containing illegal filename chars and verify output stem is sanitized.
  - Enable rename mode, trigger at least one renamed download, call `reset_rename_counter`, then verify next renamed download restarts from reset baseline (subject to collision-avoidance).
  - With a legacy config containing `clipDownloadMode=precise`, verify clip behavior still follows the normal yt-dlp section-download path.
  - With rename disabled and clip range set, verify output filename follows `<startMs>-<endMs>_<title>.mp4` and collision appends `_2`.
  - With rename disabled and no clip range, verify yt-dlp full-video output template includes both resolution and quality suffix so different presets do not collide for the same title.
  - Trigger an extension `video_selected_v2` request without `selectionScope` and assert backend parses it successfully with auto behavior.
  - Trigger a YouTube player download from `watch?v=...&list=...` and assert the forwarded `url` is canonicalized to the current `v` while yt-dlp receives `--no-playlist`.
  - Trigger a Bilibili multi-part or bangumi current-item download and assert the forwarded `url` preserves current-item semantics (`p=` or `ep`) without expanding into the full collection.
  - `src/electron-runtime/commandRouter.test.ts` must reject a non-HTTP(S) primary `url`, drop invalid `pageUrl` / `videoUrl` hints, and keep direct MP4 candidates ahead of manifest candidates.
  - `electron/videoHintNormalization.test.mts` must verify HTTP(S)-only `url` / `pageUrl` normalization plus non-video hint filtering and MP4-first candidate ordering.
  - `src/electron-runtime/ytDlpProgress.test.ts` must cover standard download lines, merge lines, `Embedding metadata`, `Deleting original file`, and unrelated noise.
- Regression assertions:
  - Config read/write path (`get_config` + `save_config`) still handles valid JSON string payload.

### 7. Wrong vs Correct

#### Wrong

```rust
#[derive(serde::Serialize)]
struct YtdlpVersionInfo {
    current: String,
    latest: String,
    update_available: bool, // frontend expects updateAvailable
}
```

```ts
const info = await invoke("check_ytdlp_version");
if ((info as any).updateAvailable) {
  // unsafe cast + untyped invoke
}
```

#### Correct

```rust
#[derive(serde::Serialize)]
struct YtdlpVersionInfo {
    current: String,
    latest: String,
    #[serde(rename = "updateAvailable")]
    update_available: bool,
}
```

```ts
const info = await invoke<{ current: string; latest: string; updateAvailable: boolean }>(
  "check_ytdlp_version"
);
if (info.updateAvailable) {
  // type-safe access
}
```

---
