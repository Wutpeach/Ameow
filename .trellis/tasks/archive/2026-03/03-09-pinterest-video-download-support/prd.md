# Pinterest Video Download Support

## Goal

Add reliable Pinterest video download support to FlowSelect without regressing the existing Pinterest image flow. Pinterest images should continue to use the current image path, while Pinterest videos should use a dedicated Pinterest pipeline powered by `pinterest-dl` and exposed through a Pinterest-native browser extension button.

## What I Already Know

- `src/App.tsx` currently special-cases `pinterest.com/pin/` as an image download by extracting `i.pinimg.com` URLs from dragged HTML.
- `src/utils/videoUrl.ts` does not classify Pinterest pin URLs as video URLs today.
- The browser extension has no Pinterest detector/content-script entry yet.
- The extension already has a shared `video_selected` bridge, cookie capture, and candidate normalization flow in `browser-extension/background.js`.
- Backend video routing currently supports direct Douyin/Xiaohongshu paths plus a default `yt-dlp` route.
- `yt-dlp` succeeds for some Pinterest pins, but it fails for the tested sample `https://www.pinterest.com/pin/403705554121341216/` with `No video formats found`.
- `pinterest-dl scrape <pin-url> --video` is not safe as a black-box integration for single-pin downloads; on the tested sample it downloaded a related pin instead of the requested pin.
- `pinterest-dl`'s lower-level download path does work when FlowSelect resolves the exact current pin video stream first and passes that explicit media payload into the downloader.
- Runtime binaries in this repo are bundled from `src-tauri/binaries/` and resolved from `binaries/` in dev and packaged builds.

## Assumptions (Temporary)

- Pinterest support should preserve the current Pinterest image behavior for image pins and image-only drag/drop HTML cases.
- MVP is focused on single-pin downloads, not Pinterest boards/search/batch scraping.
- The Pinterest video route should use `pinterest-dl` as the download engine, but FlowSelect should own current-pin metadata resolution so the exact requested pin is downloaded.
- Existing queue/progress/cancel semantics must remain consistent with other video platforms.
- MVP should support both browser-extension button entry and desktop pasted/dropped Pinterest pin URL entry.

## Open Questions

- None blocking phase 1 implementation.

## Requirements

- Keep the existing Pinterest image flow for image-only cases.
- Add desktop Pinterest URL handling for paste and drag/drop so Pinterest video pins can enter the Pinterest video pipeline without depending on the browser extension.
- Add a Pinterest browser-extension detector and button style for Pinterest domains.
- Inject one FlowSelect download button adjacent to Pinterest's native Pin/Save action area instead of the video player control bar.
- Keep detector injection idempotent across Pinterest SPA navigation and DOM re-renders.
- Reuse the shared `video_selected` bridge in `browser-extension/background.js`; do not invent a Pinterest-only WebSocket payload shape.
- Add a Pinterest-specific backend route that resolves the exact current pin metadata from Pinterest before downloading.
- The backend resolver must support top-level Pinterest video fields and carousel/video-slot structures, including the tested sample where the actual video lives in `carousel_data.carousel_slots[].videos.video_list`.
- Do not rely on `pinterest-dl scrape <pin-url>` semantics for selecting the requested pin.
- Use a dedicated Pinterest downloader runtime that calls `pinterest-dl` on an explicit resolved media payload for the current pin.
- Preserve completion semantics:
  - success emits `video-download-complete`
  - error emits `video-download-complete`
  - cancel emits `video-download-complete`
- Preserve queue visibility, trace IDs, and progress handling for Pinterest downloads.
- Package the Pinterest runtime under `src-tauri/binaries/` and resolve it through the same `binaries/` lookup model used by the current runtime tools.
- Add structured `>>>` trace logging for Pinterest route selection, metadata parsing, candidate selection, runtime spawn, success, failure, and fallback decisions.
- Desktop paste and drag/drop behavior must distinguish Pinterest image pins from Pinterest video pins so the current image flow is preserved while video pins route into the Pinterest downloader.
- Phase 1 resolver behavior uses canonical-page JSON extraction as the primary source and Pinterest internal API resolution as a secondary recovery path.

## Acceptance Criteria

- [ ] Dragging a Pinterest image pin that already works today still downloads the image through the existing image path.
- [ ] Pasting a Pinterest video pin URL into the desktop app queues the Pinterest video pipeline and downloads the exact current pin video.
- [ ] Dragging/dropping a Pinterest video pin URL into the desktop app queues the Pinterest video pipeline and downloads the exact current pin video.
- [ ] The tested sample `https://www.pinterest.com/pin/403705554121341216/` downloads the exact current pin video, not a related pin.
- [ ] A FlowSelect button appears next to the native Pinterest Pin/Save action on supported Pinterest pin UI and does not duplicate during SPA navigation.
- [ ] Clicking the Pinterest button queues one video download through the existing extension-to-desktop bridge.
- [ ] Pinterest video downloads surface queue/progress/completion behavior consistent with existing video platforms.
- [ ] All Pinterest terminal paths emit `video-download-complete` exactly once.
- [ ] The Pinterest runtime is discoverable from `binaries/` in development and packaged builds.
- [ ] Frontend and backend type/build checks continue to pass after the integration.

## Definition of Done

- Pinterest detector/button flow is implemented and manually verified on supported Pinterest pin UI.
- Backend Pinterest routing and runtime invocation are implemented with explicit contracts and logging.
- At least one public Pinterest video sample and one Pinterest image sample are manually verified.
- Relevant lint/type/build checks pass.
- Notes/spec updates are made if new reusable download patterns are introduced.

## Research Notes

### What Similar Tools / Existing Patterns Do

- FlowSelect currently handles site-specific download UX through content-script injection plus the shared `video_selected` message contract.
- FlowSelect bundles external runtime tools under `src-tauri/binaries/` and resolves them from packaged `binaries/` resources.
- `yt-dlp` has Pinterest extractor support, but it misses some pin shapes, including the tested carousel sample.
- `pinterest-dl` supports Pinterest media downloading, but its high-level `scrape(pin_url)` behavior is oriented toward related pins and broader scraping use-cases rather than "download exactly the currently requested pin".

### Constraints From This Repo

- Runtime binary/resource layout is contract-sensitive and currently documented around `binaries/`.
- The browser extension already expects a generic `video_selected` payload with optional `videoUrl`, `videoCandidates`, `title`, cookies, and quality preferences.
- The backend queue and progress UI rely on terminal completion events and typed payload stability.
- `src/App.tsx` currently hardcodes Pinterest pin URLs into the image path for drag/drop handling.
- Existing Settings update UX is implemented only for `yt-dlp`, which is treated as a single updatable runtime binary rather than a Python package stack.

### Feasible Approaches Here

**Approach A: FlowSelect-owned pin resolver + Pinterest runtime wrapper using `pinterest-dl` download internals** (Recommended)

- How it works:
  - FlowSelect resolves the exact current pin metadata from Pinterest.
  - FlowSelect selects the current pin's real video stream.
  - FlowSelect invokes a thin Pinterest runtime wrapper that constructs a single explicit media payload and lets `pinterest-dl` perform the actual file download/remux.
- Pros:
  - Downloads the exact requested pin.
  - Still uses `pinterest-dl` as requested.
  - Fits FlowSelect's single-download queue/progress model.
- Cons:
  - Requires new runtime packaging/launcher work.
  - Slightly more code than shelling out to the stock CLI.

**Approach B: Call `pinterest-dl scrape <pin-url> --video` directly**

- How it works:
  - Treat `pinterest-dl` CLI as a black box and call its existing scrape command from FlowSelect.
- Pros:
  - Smallest code surface.
- Cons:
  - Proven wrong-content behavior on the tested sample.
  - Oriented around scraping/related pins rather than exact current-pin downloads.
  - Not acceptable for FlowSelect's UX correctness bar.

**Approach C: Ignore `pinterest-dl` and build a pure FlowSelect downloader**

- How it works:
  - FlowSelect parses Pinterest metadata and downloads direct MP4/HLS itself.
- Pros:
  - Less external runtime coupling.
- Cons:
  - Conflicts with the requested technical direction.
  - Gives up the extra Pinterest-specific handling that motivated this task.

## Technical Approach

### Recommended Architecture

- Browser extension:
  - Add `browser-extension/pinterest-detector.js`.
  - Add `browser-extension/pinterest-button.css`.
  - Register Pinterest matches in `browser-extension/manifest.json`.
  - Inject near the native Pinterest Pin/Save action area; avoid player-control-bar assumptions.
  - Send the shared `video_selected` payload with `pageUrl`, `url`, optional `videoUrl`, optional `videoCandidates`, and `title`.

- Extension background:
  - Reuse the existing `video_selected` bridge.
  - Reuse cookies capture and generic candidate normalization.
  - Only add Pinterest-specific logic if needed for candidate prioritization; otherwise keep the bridge generic.

- Backend routing:
  - Update desktop paste and drag/drop Pinterest URL handling so Pinterest video pins are eligible for Pinterest backend resolution while image-only Pinterest cases keep the current image path.
  - Add Pinterest URL detection and a Pinterest-specific queued task / smart-router branch.
  - Resolve Pinterest pin metadata server-side so current-pin selection is owned by FlowSelect.
  - Support:
    - top-level `videos.video_list`
    - story pin video structures if present
    - carousel slot video structures
  - Select the best current-pin video stream before invoking the downloader runtime.

- Pinterest runtime:
  - Add a thin dedicated wrapper under `src-tauri/binaries/` for Pinterest downloads.
  - The wrapper should accept one explicit media payload for the exact current pin and use `pinterest-dl` download internals, not the high-level scrape CLI.
  - The runtime should write one final file and return its absolute path to Rust.
  - If `ffmpeg` is needed for HLS remux, Rust should provide bundled/runtime `ffmpeg` availability the same way existing runtime tools do.
  - Runtime lifecycle should be designed so a later `check_pinterestdl_version` / `update_pinterestdl` feature is possible without replacing the architectural core.

### Proposed Cross-Layer Contracts

#### Extension Message Contract

Pinterest should continue to use the existing shared shape:

```json
{
  "type": "video_selected",
  "url": "<preferred direct media url or page url>",
  "pageUrl": "<canonical pinterest pin url>",
  "videoUrl": "<optional direct media url>",
  "videoCandidates": [
    {
      "url": "https://...",
      "type": "direct_mp4|manifest_m3u8|indirect_media",
      "confidence": "high|medium|low",
      "source": "dom|script_scan|metadata|..."
    }
  ],
  "title": "<optional title>"
}
```

Contract notes:

- `pageUrl` is mandatory for Pinterest because backend current-pin resolution depends on it.
- `videoUrl` and `videoCandidates` are optional hints, not the source of truth.
- Detector must reject `blob:` and non-http candidates.

#### Backend Helper Contract

Proposed backend helpers:

- `fn is_pinterest_url(url: &str) -> bool`
- `async fn resolve_pinterest_pin_media(...) -> Result<PinterestResolvedMedia, String>`
- `async fn download_pinterest_video(...) -> Result<DownloadResult, String>`

Proposed resolved-media shape:

```json
{
  "pinId": "403705554121341216",
  "origin": "https://www.pinterest.com/pin/403705554121341216/",
  "image": {
    "url": "https://i.pinimg.com/originals/...",
    "width": 720,
    "height": 900
  },
  "video": {
    "url": "https://v1.pinimg.com/videos/...mp4",
    "width": 720,
    "height": 900
  },
  "title": ""
}
```

Contract notes:

- Resolver owns validation and must return an actionable error when the pin is not a downloadable video.
- Resolver must prefer the current pin's video over related-pin results.
- Backend must preserve `trace_id`, queue semantics, and terminal completion events.

#### Pinterest Runtime Wrapper Contract

Proposed runtime behavior:

- Input: one explicit current-pin media payload plus output directory.
- Output on success: final absolute file path written to stdout.
- Exit code:
  - `0` for success
  - non-zero for failure
- The wrapper must use `pinterest-dl` download internals for the actual download path.
- The wrapper must not call `pinterest-dl scrape <pin-url>` for current-pin selection.

### Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|---|---|---|---|
| Desktop pasted/dropped Pinterest pin URL stays trapped in image-only frontend shortcut | Desktop paste/drag test | Pinterest video pin never reaches backend resolver | Refine frontend Pinterest routing to branch by resolved pin media type |
| Pinterest detector not registered in manifest | Extension load on Pinterest | No button appears | Add Pinterest `content_scripts` entry |
| Detector injects repeatedly on SPA navigation | Navigate across pins | Only one active FlowSelect button per target UI | Add processed markers and URL/change guards |
| Detector sends only a direct URL without canonical `pageUrl` | WS payload inspection | Backend cannot safely resolve current pin | Always include canonical `pageUrl` |
| Pinterest metadata has no current-pin video | Backend resolver | Return actionable error and emit terminal completion | Stop Pinterest route cleanly |
| Current pin is a carousel pin with video in slot metadata | Backend resolver | Select current pin video correctly | Parse carousel slot structures explicitly |
| Integration shells out to `pinterest-dl scrape <pin-url>` | Sample-content verification | Wrong related pin may download | Do not use stock scrape path for single-pin downloads |
| Pinterest runtime cannot be found from `binaries/` | Runtime spawn | Spawn fails predictably with actionable error | Add bundled resource + path resolution helper |
| HLS download needs ffmpeg but runtime cannot find it | Runtime execution | Download/remux fails | Provide bundled/runtime `ffmpeg` path or PATH wiring |
| Error/cancel path misses completion event | Frontend progress UI | Spinner/progress gets stuck | Emit `video-download-complete` on all terminal paths |

### Good / Base / Bad Cases

- Good:
  - Clicking the Pinterest extension button on the tested sample downloads `403705554121341216.mp4`.
  - Pasting or dragging the tested sample Pinterest pin URL into the desktop app downloads `403705554121341216.mp4`.
  - An image-only Pinterest pin still follows the existing image flow and does not queue a video download.
  - A carousel pin with embedded video resolves the exact current pin media rather than related content.
- Base:
  - Detector cannot extract useful candidates, but backend still succeeds from canonical `pageUrl`.
  - Pinterest metadata returns a direct MP4 and the runtime downloads it without remux complexity.
- Bad:
  - The runtime downloads a related pin instead of the requested pin.
  - A Pinterest image pin is rerouted into the video pipeline and regresses current behavior.
  - The extension button duplicates as the user navigates Pinterest SPA pages.

## Implementation Plan

### Phase 0: Stop Further Drift

- Freeze the current `ffmpeg`-first Pinterest runtime direction as an experiment, not the target architecture.
- Keep the current detector hardening work because it reduces false-positive video buttons on image pins.
- Do not keep expanding the bespoke downloader path unless it is needed as a narrowly scoped fallback.

### Phase 1: Re-center on `pinterest-dl`

- Restore `pinterest-dl` as the primary Pinterest download engine for FlowSelect video pins.
- Keep FlowSelect-owned current-pin resolution in Rust so we select the exact requested pin before download.
- Build the runtime around explicit `PinterestMedia` / `VideoStreamInfo` payload construction and `MediaDownloader.download(...)` rather than `pinterest-dl scrape <pin-url>` as a black box.

### Phase 2: Stabilize The Resolver

- Fix the Pinterest API field request that currently asks for `pin.images.orig`, which now returns HTTP 400 on some pins.
- Reduce reliance on slow page-HTML fallback by making the primary API request schema-compatible again.
- Preserve HTML / related-module fallback only as secondary recovery paths.
- Keep logging that shows which resolver branch won (`api_main_pin`, `page_html`, `api_related_modules`) and whether video was present.

### Phase 3: Replace The Python Runtime Shape

- Replace the current runtime split:
  - `video_url` -> `ffmpeg`
  - no `video_url` -> `pinterest-dl`
- New target:
  - explicit current-pin media payload -> `pinterest-dl` downloader path by default
  - optional direct `ffmpeg` fallback only when `pinterest-dl` fails on a direct CDN asset that Rust has already validated
- Feed cookies/origin/referer into the runtime in a form compatible with upstream downloader expectations.
- Keep a single stdout contract for Rust:
  - progress lines
  - one final result line
  - clean non-zero exit on failure

### Phase 4: Package Like A Real Runtime

- Stop depending on host Python for production Pinterest downloads.
- Introduce a packaged Pinterest sidecar for Windows first:
  - preferred artifact name: `pin-dl-x86_64-pc-windows-msvc.exe` or equivalent wrapper name
  - bundle it through `src-tauri/binaries/`
- In CI, build this wrapper from a pinned `pinterest-dl` release/tag instead of downloading arbitrary latest at runtime.
- Keep version pinning explicit in workflow/config so breakage is reviewable.

### Phase 5: Only Then Add Runtime Management

- After the bundled runtime path is stable, consider a Settings surface similar to `yt-dlp`.
- Unlike `yt-dlp`, this should likely update a FlowSelect-built wrapper version, not directly mutate a Python package install in user space.

## Recommended Decision

Choose a two-track plan:

- Short-term delivery:
  - Use `pinterest-dl` internals as the main runtime engine.
  - Continue FlowSelect-owned pin resolution in Rust.
  - Keep direct `ffmpeg` only as a contained fallback, not the main path.
- Long-term packaging:
  - Build and ship a FlowSelect-maintained `pin-dl` wrapper executable in CI, similar in user experience to `yt-dlp`, but sourced from pinned upstream Python package code rather than an official upstream exe.

## Explicit Non-Goals For MVP

- No black-box `pinterest-dl scrape <pin-url>` integration as the sole production path.
- No continued investment in a fully bespoke Pinterest downloader unless upstream internals prove unusable.
- No dependency on system Python for packaged desktop releases.

## Decision (ADR-lite)

**Context**

Pinterest needs better success for video downloads than the current default `yt-dlp` route provides. The requested direction is to use `pinterest-dl`, but FlowSelect also needs exact single-pin correctness and packaged desktop runtime reliability.

**Decision**

Use **Approach A**: FlowSelect owns Pinterest current-pin metadata resolution, then invokes a thin Pinterest runtime wrapper that uses `pinterest-dl` for the actual download work.

**Consequences**

- Positive:
  - Exact requested pin downloads are achievable.
  - We keep `pinterest-dl` in the stack as requested.
  - The architecture stays aligned with FlowSelect's queue/progress model.
- Negative:
  - New runtime packaging/launcher work is required.
  - Pinterest route becomes more explicit than the generic `yt-dlp` route.

## Out of Scope

- Pinterest board download, search download, or batch scraping UX.
- Private/auth-only Pinterest support beyond what falls out naturally from existing cookie plumbing.
- Replacing the existing Pinterest image download implementation wholesale.
- Generalizing this task into a multi-platform scraper abstraction.
- Using `pinterest-dl`'s stock scrape/search flows as end-user features in FlowSelect.
- A Settings UI for checking/updating the Pinterest downloader in the first milestone.

## Technical Notes

- Task directory: `D:\FlowSelect\.trellis\tasks\03-09-pinterest-video-download-support`
- Key files inspected:
  - `browser-extension/background.js`
  - `browser-extension/douyin-detector.js`
  - `browser-extension/manifest.json`
  - `src/App.tsx`
  - `src-tauri/src/lib.rs`
  - `src-tauri/tauri.conf.json`
- Runtime/spec references added to task context:
  - `.trellis/spec/guides/cross-layer-thinking-guide.md`
  - `.trellis/spec/backend/sidecar-runtime-contracts.md`
  - `.trellis/spec/backend/direct-download-onboarding-contracts.md`
  - `.trellis/spec/frontend/type-safety.md`
  - `.trellis/spec/backend/type-safety.md`
  - `.trellis/spec/backend/logging-guidelines.md`
- Empirical findings from this session:
  - `yt-dlp 2026.03.03` fails on Pinterest sample `403705554121341216`.
  - `pinterest-dl scrape(pin-url)` downloaded related pin `2111131073033052` instead of the requested sample.
  - `pinterest-dl` download internals succeeded when given the explicitly resolved current-pin media payload for `403705554121341216`.
- Runtime-management note:
  - A `yt-dlp`-style update panel already exists in `SettingsPage.tsx` / `src-tauri/src/lib.rs`.
  - Pinterest downloader version display/update is deferred until after the bundled downloader path is stable.
- The task is intentionally left in planning/review state until PRD approval; it has not been activated for implementation yet.
