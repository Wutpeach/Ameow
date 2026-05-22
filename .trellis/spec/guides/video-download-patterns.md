# Video Download Patterns

> Implementation patterns for video downloading from different platforms.

---

## Overview

FlowSelect uses a sidecar-first architecture:
- Runtime site-provider planning must not emit `direct` engine plans; `direct` is no longer a backend engine id.
- `gallery-dl` for Pinterest and supported extractor-first sites that are routed through the site-provider layer
- `yt-dlp` as the generic fallback and the primary route for dedicated `yt-dlp` providers such as YouTube/Twitter/Bilibili
- `douyin-dl` for Douyin page extraction

Media candidate labels such as `direct_mp4` and `direct_cdn` are still valid hint vocabulary from browser/page inspection, but they do not imply a direct HTTP backend.

videodl has been removed from runtime and packaging.

---

## Pattern 1: gallery-dl (Supported Sites)

**Used for**: gallery-dl-supported sites that do not already have a dedicated provider with a stronger route preference.

**Flow**:
```
Browser Extension / UI URL
  -> site provider resolves gallery-dl-supported host
  -> optional provider-specific URL normalization (for example Weibo detail URLs)
  -> gallery-dl sidecar
  -> yt-dlp fallback on failure
```

**Implementation**:
- `src/sites/gallery-dl-supported.ts`
- `src/sites/weibo.ts`
- `src/sites/gallery-dl-support.ts`

---

## Pattern 2: yt-dlp (Dedicated + Generic Fallback)

**Used for**: YouTube, Twitter/X, Bilibili, and generic page URLs

**Flow**:
```
Browser Extension / UI URL
  -> Rust smart router
  -> yt-dlp sidecar
```

**Implementation**:
- `download_video_internal()` in `src-tauri/src/lib.rs`
- Uses yt-dlp as sidecar binary
- Supports extension cookies when provided (including YouTube) via `--cookies`

---

## Pattern 3: Direct Media Candidates As Hints

**Used for**: browser/page extraction metadata such as `videoUrl`, `videoCandidates[]`, `direct_mp4`, or `direct_cdn`.

**Contract**:
- Providers may preserve media candidates on the intent when an active sidecar backend can use that context.
- Providers must not create `direct` engine plans from those hints.
- Pinterest ignores direct media hints for backend selection and always uses `gallery-dl`.
- Xiaohongshu may preserve video candidates for context while still routing through canonical-note `yt-dlp`.

### WebSocket Message Contract

```json
{
  "action": "video_selected_v2",
  "data": {
    "url": "page URL or direct media URL",
    "pageUrl": "optional canonical page URL",
    "videoUrl": "optional legacy direct URL",
    "videoCandidates": [
      {
        "url": "https://...mp4",
        "type": "direct_cdn",
        "confidence": "high",
        "source": "video_element"
      }
    ],
    "title": "optional title",
    "clipStartSec": "optional non-negative number seconds",
    "clipEndSec": "optional non-negative number seconds",
    "ytdlpQualityPreference": "optional best|balanced|data_saver",
    "cookies": "optional Netscape cookie text"
  }
}
```

`videoCandidates` is optional and backward compatible.
`clipStartSec/clipEndSec` are optional and must be provided together for section download.
`ytdlpQualityPreference` is optional. The browser extension popup defaults to `balanced`, while the backend still coerces absent or unknown values to `best`.

### yt-dlp Quality Tier Contract

- Trigger: browser extension popup quality selector changes, then `background.js` forwards the preference through `video_selected_v2`.
- Scope: this field affects only `yt-dlp` downloads and direct-download fallback-to-yt-dlp paths.
- Direct downloads for Douyin still prioritize the highest-quality direct candidate and ignore this field for the direct attempt itself. Xiaohongshu video downloads now use yt-dlp with canonical note URLs instead of direct CDN candidates.

Popup labels:
- `best` is shown as `Highest`
- `balanced` is shown as `Balanced` and is the default on fresh extension installs
- `data_saver` is shown as `Saver`

Field semantics:
- `best`:
  - backend requests the highest tier available to the current account/session
  - resolution remains the first priority
  - when multiple candidates land at the same practical tier, backend prefers more AE-friendly codec/audio/container combinations before broader fallback
  - to avoid collapsing 1440p/2160p down to MP4-compatible 1080p, yt-dlp may merge to `mkv`
- `balanced`:
  - backend prefers exact `1080p`
  - if `1080p` is unavailable, fallback stays within the best available `<=1080p`
  - fallback still preserves MP4+M4A pairing before dropping to a muxed MP4 stream
  - if no `<=1080p` stream exists, fallback continues to best available stream
- `data_saver`:
  - backend prefers exact `360p`
  - if `360p` is unavailable, fallback prefers streams lower than `360p`
  - fallback preserves MP4+M4A pairing before dropping to a muxed MP4 stream
  - if the platform minimum is higher than `360p`, fallback uses the platform minimum available stream
- unknown / missing:
  - backend coerces to `best`

Audio/container rule:
- `best` is allowed to use broader `bestvideo*+bestaudio/best` selection so the highest account-visible tier can be preserved.
- When ffmpeg-backed merging is available, `best` must prefer `--merge-output-format mp4/mkv` rather than forcing `mkv` only.
- Reason: account-limited or preview-grade `best` selections can still resolve to an MP4-compatible `h264 + aac/m4a` result, and those should not be pushed into an unnecessary downstream transcode purely because the intent was `best`.
- `balanced` and `data_saver` stay on the conservative MP4/M4A path.
- Do not use a broad `bestaudio`/`ba` fallback while still forcing `--merge-output-format mp4` for the conservative tiers.

### AE-Safe Output Normalization Contract

- Scope:
  - applies to yt-dlp-backed outputs, including the normal yt-dlp success path and slice-reuse success path
  - does not change the browser extension quality UI or the meaning of `best` / `balanced` / `data_saver`
- Goal:
  - keep current quality-tier selection behavior
  - hide container/codec complexity from users by producing a final AE-friendly file when needed
- Probe-first rule:
  - backend runs `ffprobe` on the completed yt-dlp output before emitting terminal success
  - if probe shows `mp4 + h264 + aac` (or no audio stream), backend skips extra work
  - if probe fails, backend logs the warning and falls back to the safest normalization path instead of exposing the raw file immediately
- Normalization rule:
  - `h264` video + `aac` audio in a non-`mp4` container -> remux to `mp4`
  - `h264` video + non-`aac` audio -> keep video, transcode audio to `aac`, output `mp4`
  - non-`h264` video (`vp9`, `av1`, `hevc`, unknown) -> full transcode to `h264 + aac + mp4`
- Encoder selection rule:
  - full transcode tries hardware `h264` encoder first using the existing platform order
  - Windows: `h264_nvenc` -> `h264_qsv` -> `h264_amf`
  - macOS: `h264_videotoolbox`
  - if hardware transcode fails at runtime, backend retries automatically with `libx264`
- Output rule:
  - final user-visible file path must point to the normalized `mp4`
  - intermediate `mkv`/temporary files should be removed or kept out of the final returned path
  - `video-download-complete` success must only emit after normalization is done
- Progress rule:
  - normalization continues to use `video-download-progress` with `post_processing` stage so frontend queue/progress state stays stable

Backend touchpoints:
- browser extension / desktop bridge preserves `clipStartSec`, `clipEndSec`, and `ytdlpQualityPreference` on `video_selected_v2`
- `src/sites/youtube.ts` and `src/sites/bilibili.ts` must forward clip metadata into the resolved `VideoDownloadIntent`
- `src/electron-runtime/commandRouter.ts` normalizes clip-range seconds before queueing
- `src/electron-runtime/ytDlpDownload.ts` owns yt-dlp format selection, `--download-sections`, and output naming
- `src/electron-runtime/service.ts` emits the terminal `video-download-complete` event after yt-dlp finishes
- `src/electron-runtime/transcode.ts` remains an AE-compatibility follow-up path for completed downloads; it is not part of clip extraction
- for YouTube, if a cookies-backed yt-dlp attempt fails with challenge/no-format symptoms, backend retries once without cookies before emitting terminal failure
- if backend needs to inspect yt-dlp's already-selected format without downloading media, use `--skip-download` plus `--print before_dl:...`; do not use `-s`/simulate mode because `before_dl` hooks do not fire there and the probe will falsely report no selection

### WS Queue Contract

- `video_selected_v2` requests are managed by a bounded-concurrency backend scheduler.
- Scheduler concurrency is fixed at `3` active video downloads.
- Queue count is exposed to frontend through `video-queue-count` with payload `{ activeCount, pendingCount, totalCount, maxConcurrent }`.
- `activeCount` is the number of currently running video downloads.
- `pendingCount` is the number of queued tasks waiting for capacity.
- `totalCount = activeCount + pendingCount`.
- `video-download-progress` and `video-download-complete` must include `traceId` so frontend can aggregate concurrent tasks safely.
- Cancel semantics for the shared cancel control are "cancel all active downloads and clear pending queue".

### YouTube + Bilibili Section Download Contract

When extension sends both `clipStartSec` and `clipEndSec` for `youtube` or `bilibili`:

- Provider intent preserves the raw clip range seconds.
- Validation rules:
  - only `youtube` and `bilibili` may enter section download
  - both fields required together
  - both must be finite non-negative numbers
  - `clipEndSec > clipStartSec`
- `src/electron-runtime/ytDlpDownload.ts` appends:
  - `--download-sections "*HH:MM:SS(.mmm)-HH:MM:SS(.mmm)"`
- No-range requests keep existing full-download path unchanged.

### YouTube + Bilibili Section Validation & Error Matrix

| Condition | Expected Behavior | Terminal Event |
|---|---|---|
| supported site + both `clipStartSec` + `clipEndSec` valid | run yt-dlp with `--download-sections` | success/failure emits `video-download-complete` |
| unsupported site carries clip fields | reject request before spawn | emit `video-download-complete` with error |
| only one clip field present | reject request before spawn | emit `video-download-complete` with error |
| negative/NaN/invalid value | reject request before spawn | emit `video-download-complete` with error |
| `clipEndSec <= clipStartSec` | reject request before spawn | emit `video-download-complete` with error |
| no clip fields | full download path | unchanged behavior |

### YouTube + Bilibili Section Good / Base / Bad Cases

- Good:
  - user sets IN/OUT in the YouTube or Bilibili player; button-triggered download runs yt-dlp section download directly.
- Base:
  - user does not set IN/OUT; cat button triggers normal full-video download.
- Bad:
  - extension sends clip fields for an unsupported yt-dlp provider such as X.
  - extension sends only one clip field.
  - extension sends `clipEndSec <= clipStartSec`.

### Smart Router Contract (`download_video_smart`)

```rust
if is_xiaohongshu_note_url(&url) { /* yt-dlp */ }
if is_pinterest_url(&url) { /* gallery-dl */ }
// otherwise: provider-selected sidecar backend
```

### Validation & Error Matrix

| Condition | Expected Behavior | Fallback |
|---|---|---|
| `videoUrl` is a direct CDN URL | treat it as a candidate hint only | selected provider sidecar owns extraction/download |
| Xiaohongshu homepage drag token says `mediaType=image` | preserve image path unless note-aware resolution reports video intent | no direct-video fallback |
| `videoUrl` missing/`null` | use smart router by page/url | yt-dlp |
| `ytdlpQualityPreference=balanced` | yt-dlp paths prefer 1080p | standard yt-dlp fallback chain |
| `ytdlpQualityPreference=data_saver` | yt-dlp paths prefer 360p or lower | lowest available tier if platform min is above 360p |
| `ytdlpQualityPreference` missing/invalid | normalize to `best` | best available yt-dlp stream |
| YouTube cookies-backed attempt fails with `n challenge` / `Only images are available` / `Requested format is not available` | retry yt-dlp once without cookies before terminal failure | public video downloads can recover without changing UI |
| media URL is `blob:` | detector must not send blob as a media candidate | send page URL + optional valid candidates |

### Good / Base / Bad Cases

- Good:
  - Extension sends `videoUrl` + `pageUrl` + candidates; backend treats candidates as hints and still routes through an active sidecar backend.
  - Xiaohongshu homepage image-card drag keeps downloading the dragged image unless the note itself resolves as video.
  - Xiaohongshu video notes enqueue canonical note URLs for yt-dlp instead of xhscdn direct candidates.
  - Extension sends `ytdlpQualityPreference=balanced`; Bilibili/YouTube yt-dlp path prefers 1080p when available.
  - A `best` high-resolution yt-dlp download can resolve to the highest visible tier, including `1440p/2160p`, with internal `mkv` merge when required by the stream mix, while the final returned file is normalized to AE-safe `mp4` when needed.
  - A `best` Bilibili preview-limited request that only resolves to `1080p` with MP4-compatible streams should land directly as `mp4` and skip the transcode queue.
- Base:
  - Extension cannot extract candidate URLs; sends page URL only; backend uses the provider-selected sidecar path.
  - Xiaohongshu detail-page cat button queues a canonical note URL and yt-dlp owns extraction.
  - Extension omits `ytdlpQualityPreference`; backend defaults to `best`.
- Bad:
  - Extension sends `blob:` as a media candidate.
  - Xiaohongshu homepage image-card drag reuses a previous detail-page MP4 from `performance` or script state and downloads the wrong video.
  - Slice cache reuses a full-source download generated for `best` while current request is `data_saver`.
  - `best` is still constrained to MP4-friendly selectors and silently tops out at `1080p` even though the account can access higher tiers.
  - conservative tiers use arbitrary `+ba` audio while still forcing MP4 output, producing a file that some players treat as silent.
  - backend emits terminal success before AE-safe normalization finishes, so frontend/AE still receives the raw `mkv` or incompatible codec output.
  - hardware transcode fails and backend does not retry with CPU, causing unnecessary terminal failure.
  - Provider planning creates a `direct` engine plan from a browser-discovered media candidate.

### Required Tests

- Xiaohongshu control-bar button path: confirm it queues a canonical note URL for yt-dlp.
- Xiaohongshu direct CDN URL path: confirm the Xiaohongshu provider does not claim a bare `xhscdn` URL without note context.
- Missing direct URL path: send only page URL and confirm yt-dlp fallback works.
- Xiaohongshu homepage drag image path: drag an image card after downloading a different detail-page video in the same tab and confirm the image card still resolves to image, not the previous video URL.
- Cache path: repeat same page URL within TTL and confirm trace shows cache-origin candidate.
- Quality tier path: send `ytdlpQualityPreference=balanced` and confirm yt-dlp args prefer `1080p`.
- Data saver path: send `ytdlpQualityPreference=data_saver` and confirm yt-dlp args prefer `360p` or lower-tier fallback.
- Highest-tier path: confirm a `best` request can resolve to the current account-visible top tier and may output `mkv` when needed.
- Highest-tier MP4-preferred path: confirm a `best` request with MP4-compatible selected streams uses `mp4` output first and does not enter downstream transcode just because the requested tier was `best`.
- High-resolution audio path: confirm conservative tiers still preserve audio when MP4 output is forced.
- AE-safe skip path: feed an existing `mp4 + h264 + aac` result and confirm no extra transcode/remux happens before success.
- AE-safe remux path: feed a `mkv` containing `h264 + aac` and confirm final returned file is `mp4` without full video re-encode.
- AE-safe audio path: feed `h264 + opus` output and confirm final returned file is `mp4` with `aac` audio.
- AE-safe GPU fallback path: induce hardware encoder failure and confirm backend retries with `libx264` instead of failing immediately.
- YouTube cookie fallback path: provide cookies that trigger `n challenge solving failed` / `Requested format is not available` and confirm backend retries once without cookies.
- YouTube section path: set IN/OUT and verify backend logs `Section download enabled` with formatted range.
- YouTube invalid section path: send invalid clip range and verify immediate error completion event.
- Queue path: trigger more than three `video_selected_v2` requests quickly and verify up to three tasks run concurrently while the rest remain pending.
- Queue count path: trigger four queued requests and verify backend emits `video-queue-count` transitions with distinct `activeCount` / `pendingCount` changes, for example `1/0 -> 2/0 -> 3/1 -> 2/1 -> 1/0 -> 0/0`.

---

## Pattern 4: Download Trace Baseline / Gate Report

Use `DownloadTrace` logs to generate comparable reports:

```bash
python3 ./.trellis/scripts/download_trace_report.py \
  --input <flowselect-log-file> \
  --output .trellis/tasks/02-26-phase-out-videodl-direct-ytdlp/deletion-gate-report.md \
  --env canary \
  --window-days 7 \
  --max-direct-fallback-ratio 0.35
```

Expected report sections:
- Platform success/failure/cancelled summary
- Outcome taxonomy ratio (`direct_success`, `direct_failed_then_ytdlp_success`, etc.)
- Route timing percentiles (`direct_douyin`, `yt_dlp`, historical `direct_xiaohongshu` / `videodl` if present in old logs)
- Gate status summary

---

## Key Lessons

1. SPA pages: RENDER_DATA may be null on initial load; extract from DOM/resources/scripts.
2. Blob URLs: `blob:` can play in page but cannot be used as downloader input.
3. URL detection: include Douyin CDN domains (`douyinvod.com`, `douyincdn.com`) in direct route checks; Xiaohongshu video routing uses canonical note URLs for yt-dlp.
4. Cross-layer payload: keep `video_selected_v2.data.videoUrl` optional.
5. Cross-layer payload: `video_selected_v2.data.ytdlpQualityPreference` must stay optional and normalize unknown values to `best`.
5. Completion event: always emit `video-download-complete` on all terminal paths.
6. Concurrent video downloads require task-identity payloads (`traceId`) on progress and completion events.
7. Shared cancel controls are only safe when backend state tracks active children and cancellation markers per task.
