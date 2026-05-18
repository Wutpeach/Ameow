# Pinterest Downloader Implementation Design

## Status

Proposed for review on 2026-03-10.

## Executive Summary

FlowSelect should ship Pinterest video download through a single packaged downloader sidecar, `pin-dl`, that is built by FlowSelect and bundled like `yt-dlp`.

This design makes four hard decisions:

1. FlowSelect will not keep a top-level `ffmpeg` download path for Pinterest video.
2. FlowSelect will not treat `pin-dl scrape <pin-url>` as the production integration contract.
3. FlowSelect will package a `pin-dl` executable in CI and ship it under `src-tauri/binaries/`.
4. FlowSelect will reuse upstream `pinterest-dl` modules for media modeling and download execution instead of reimplementing Pinterest download logic from scratch.

## Problem Statement

The current Pinterest flow has drifted into an unstable hybrid:

- Rust resolves current-pin metadata.
- The Python runtime downloads direct media with `ffmpeg`.
- `pinterest-dl` is only used on a fallback branch.
- Production still depends on host Python instead of a packaged sidecar.

This creates three user-visible failures:

- slow time-to-download because the resolver is hitting brittle Pinterest API fields and then falling back to HTML parsing
- stuck `download` state because the runtime has weak progress semantics and network behavior differs from the Rust path
- architecture drift away from the original requirement to use `pinterest-dl`

## Goals

- Download the exact current Pinterest pin video from a pin URL.
- Use `pinterest-dl` as the only Pinterest download engine at the product level.
- Ship Pinterest download support as a bundled runtime, not a host-Python feature.
- Preserve FlowSelect queue, progress, cancel, logging, and completion contracts.
- Keep Pinterest image flow unchanged.
- Ship Windows and macOS support in the same release milestone.

## Non-Goals

- No Pinterest boards, search, or batch scraping UX.
- No top-level `ffmpeg` fallback path owned by FlowSelect.
- No black-box shell integration whose only contract is `pin-dl scrape <pin-url>`.
- No runtime `pip install latest` behavior in production.

## Hard Decisions

### 1. Single Engine

Pinterest video download will have one product-level engine: `pin-dl`.

`ffmpeg` may still exist as an internal transitive tool if upstream downloader code invokes it for remux/HLS handling, but FlowSelect will not maintain a parallel download engine beside `pinterest-dl`.

### 2. No Black-Box CLI Contract

FlowSelect will not model production integration as:

```text
pin-dl scrape <pin-url> --video
```

Reasons:

- FlowSelect needs exact current-pin correctness, not "whatever the CLI resolves from this URL today".
- FlowSelect needs typed progress, cancel, terminal completion, and trace logging.
- FlowSelect must control cookies, referer, and page-origin behavior explicitly.
- FlowSelect needs stable error classes for UX and diagnostics.
- A future upstream CLI behavior change should not silently change FlowSelect semantics.

The CLI remains useful for local debugging and manual smoke tests.

### 3. Package A Real Sidecar

FlowSelect will ship a bundled `pin-dl` executable, similar to the way `yt-dlp` is bundled today.

Important distinction:

- `yt-dlp` is consumed as an upstream-published binary.
- `pin-dl` will be a FlowSelect-built wrapper executable that embeds a pinned version of upstream `pinterest-dl`.

### 4. Reuse Upstream Internals

The sidecar will call upstream `pinterest-dl` modules directly for:

- media/domain objects
- downloader orchestration
- stream/download handling

FlowSelect will not reimplement Pinterest media download logic unless a narrowly scoped upstream gap forces it.

## Why Not Directly Integrate `pin-dl scrape <pin-url>`

The question is not whether upstream can download from a single pin URL. It can. The question is whether that CLI should be the only integration boundary for a desktop app with stronger correctness and observability requirements.

It should not, for these reasons:

1. URL-level CLI behavior is weaker than an explicit current-pin payload contract.
2. CLI stdout is not a stable typed API for progress and terminal states.
3. Cookies, referer, and page context are harder to inject and debug consistently.
4. Wrong-pin bugs become harder to localize because selection and download are fused inside a black box.
5. FlowSelect already needs its own resolver for image-vs-video routing and browser-extension semantics.

## Upstream Facts This Design Depends On

- `pinterest-dl` exposes a CLI entrypoint named `pin-dl`.
- `pinterest-dl` exposes Python API usage for scraping and downloading.
- FlowSelect already bundles extra runtime binaries through `src-tauri/binaries/`.

References:

- CLI docs: <https://github.com/sean1832/pinterest-dl/blob/main/doc/CLI.md>
- API docs: <https://github.com/sean1832/pinterest-dl/blob/main/doc/API.md>
- Project packaging metadata: <https://github.com/sean1832/pinterest-dl/blob/main/pyproject.toml>

## Current Local Constraints

- Current Pinterest runtime still branches to `ffmpeg` when `video_url` exists: [src-tauri/binaries/pinterest-runtime.py](D:/FlowSelect/src-tauri/binaries/pinterest-runtime.py#L374)
- Current production path still resolves a host Python runtime: [src-tauri/src/lib.rs](D:/FlowSelect/src-tauri/src/lib.rs#L853)
- Current Pinterest API field list includes `pin.images.orig`, which is already returning 400 on some pins: [src-tauri/src/lib.rs](D:/FlowSelect/src-tauri/src/lib.rs#L6009)
- Tauri already packages Pinterest-prefixed binaries/resources: [src-tauri/tauri.conf.json](D:/FlowSelect/src-tauri/tauri.conf.json#L45)
- Release workflow already knows how to fetch/build and package extra binaries before Tauri build: [.github/workflows/release.yml](D:/FlowSelect/.github/workflows/release.yml#L33)

## Target Architecture

### Layer 1: Browser Extension

Responsibilities:

- inject Pinterest download button only on likely video pins
- send canonical `pageUrl`
- optionally send direct candidate hints
- never own final media correctness

Contract:

```json
{
  "type": "video_selected",
  "url": "<page-url-or-candidate-url>",
  "pageUrl": "https://www.pinterest.com/pin/<id>/",
  "videoUrl": "<optional-candidate>",
  "videoCandidates": [],
  "title": "<optional>"
}
```

### Layer 2: Rust Backend

Responsibilities:

- route Pinterest pin URLs into Pinterest flow
- distinguish image pins from video pins
- resolve the exact current pin
- manage queue, cancel, progress, tracing, and terminal completion
- launch bundled `pin-dl` sidecar

Rust owns correctness. The sidecar owns download execution.

### Layer 3: `pin-dl` Sidecar

Responsibilities:

- receive one explicit current-pin media payload
- convert payload into upstream `pinterest-dl` downloader inputs
- emit stable stdout progress/result lines for Rust
- exit non-zero on failure with one actionable stderr summary

### Layer 4: Upstream `pinterest-dl`

Responsibilities:

- perform the actual Pinterest-aware media download
- handle stream/container-specific download details
- optionally invoke internal remux behavior if required

## Resolver Strategy

### Decision

Rust keeps a first-party resolver for "current page -> exact current pin media".

### Why Rust Owns This

- FlowSelect already needs Pinterest-specific routing before any sidecar runs.
- The extension and desktop paste flow need a shared decision point for image-vs-video handling.
- Wrong-pin bugs are easier to debug when resolution is visible in Rust traces.

### Resolver Order

1. Validate canonical pin URL and extract `pin_id`.
2. Attempt current-pin resolution using a schema-compatible primary source.
3. If primary resolution fails, try HTML-derived JSON state from the canonical page.
4. If still unresolved, fail cleanly as "pin is not a downloadable video" or "resolver failed".

### Primary Source Requirement

The current field request using `pin.images.orig` is already broken and must not remain the default primary path.

Implementation requirement:

- either fix the Pinterest API request schema immediately
- or replace it as the primary source with a more stable current-page JSON extraction path

Recommended default for phase 1:

- use canonical-page JSON extraction as the primary current-pin source
- keep Pinterest internal API resolution as a secondary recovery path

Reason:

- it is closer to the actual page the user clicked
- it reduces dependence on brittle internal field lists that are already returning 400
- it better matches the "download this exact current pin" product requirement

The tradeoff is some extra parsing cost. That is acceptable for phase 1 if it materially improves correctness and stability.

## Sidecar Contract

### Input

Rust writes one JSON file and passes it to `pin-dl`.

Proposed schema:

```json
{
  "traceId": "dl-...",
  "pageUrl": "https://www.pinterest.com/pin/3940718420855369/",
  "pinId": "3940718420855369",
  "title": "Pinterest",
  "origin": "https://www.pinterest.com/pin/3940718420855369/",
  "cookiesHeader": "name=value; ...",
  "image": {
    "url": "https://i.pinimg.com/...",
    "width": 720,
    "height": 1280
  },
  "video": {
    "url": "https://v1.pinimg.com/videos/....mp4",
    "width": 720,
    "height": 1280,
    "durationSeconds": 12.3
  },
  "outputDir": "C:/Users/Administrator/Desktop/FlowSelect_Received"
}
```

### Output

The sidecar writes stdout lines only in these forms:

```text
FLOWSELECT_PINTEREST_PROGRESS<TAB><done><TAB><total>
FLOWSELECT_PINTEREST_STAGE<TAB><stage>
FLOWSELECT_PINTEREST_RESULT<TAB><absolute-output-path>
```

### Exit Codes

- `0`: success
- `10`: pin is valid but has no downloadable video
- `11`: resolver payload is invalid
- `12`: download failed
- `13`: cancelled
- any other non-zero: unexpected runtime failure

Rust will continue to emit `video-download-complete` exactly once on all terminal paths.

## Sidecar Implementation

### Recommended Shape

Build a small FlowSelect Python entrypoint that wraps upstream `pinterest-dl` modules, then freeze it into a platform executable.

Internal logic:

1. load input JSON
2. validate required fields
3. construct upstream media object(s)
4. invoke upstream downloader
5. map upstream progress into FlowSelect progress lines
6. print final result path

### Packaging Recommendation

Use a repo-owned build script plus a Python freezer to produce the executable.

Recommended initial approach:

- Windows: PyInstaller one-file or one-dir executable
- macOS: matching platform build on the existing macOS GitHub Actions runners

Reason:

- fastest path to a shippable sidecar
- no dependency on host Python at runtime
- easiest to fit into the current release workflow

The exact freezer can change later if startup time or binary size become a problem. That does not change the sidecar contract.

## CI / Release Design

### Artifact Policy

Do not fetch "latest `pinterest-dl`" during every release build.

Instead:

- pin the upstream `pinterest-dl` version in repo
- build `pin-dl` from that pinned version in CI
- update the pinned version through a reviewed PR or dedicated update workflow

Reason:

- reproducible builds
- debuggable regressions
- controlled rollout when upstream Pinterest handling changes

### Windows Build

Add a workflow step before Tauri build:

1. create isolated Python environment
2. install pinned `pinterest-dl`
3. install freezer tool
4. build `pin-dl-x86_64-pc-windows-msvc.exe`
5. place it in `src-tauri/binaries/`

### macOS Build

Mirror the same step on both macOS runners and emit target-specific sidecars into `src-tauri/binaries/`.

### Tauri Resources

Continue using the existing Pinterest binary resource glob:

```json
"binaries/pinterest-*": "binaries/"
```

At implementation time, rename this to match the final sidecar naming convention if needed.

## Local App Integration

### Rust Changes

- replace `python_binary_path()` + script spawn with sidecar resolution logic
- add `pinterest_downloader_binary_path()` similar to `ytdlp_binary_path()`
- keep watchdog and progress parsing, but parse sidecar-specific line prefixes
- remove the current `video_url -> ffmpeg` runtime assumption

### Runtime Binary Resolution

Expected helper pattern:

- `pinterest_downloader_binary_filename()`
- `pinterest_downloader_binary_path(app)`

This should mirror the existing `yt-dlp` pattern for consistency.

## Progress And Cancellation

### Progress

Progress must come from the sidecar, not inferred only from stderr text.

Required behavior:

- sidecar emits an initial stage within 2 seconds of process start
- sidecar emits periodic progress or heartbeat during long downloads
- Rust watchdog kills and fails the task if sidecar goes silent past the configured timeout

### Cancellation

Cancellation remains Rust-owned:

- Rust kills the child PID
- Rust maps that outcome to a single terminal completion event
- sidecar should treat SIGTERM / process kill as cancellation-compatible

## Observability

Required structured trace points:

- `route_selected`
- `pinterest_resolver_primary`
- `pinterest_resolver_html`
- `pinterest_candidate_selected`
- `pinterest_sidecar_spawn`
- `pinterest_sidecar_stage`
- `pinterest_sidecar_result`
- `pinterest_sidecar_error`

Wrong-pin debugging must always be possible from logs without attaching a debugger.

## Risks

### Risk 1: Upstream Object Construction Is Not Sufficient

Mitigation:

- spike with one known-good pin and one failing pin before full integration
- if needed, reuse deeper upstream modules instead of only top-level downloader wrapper

### Risk 2: Resolver Drift

Mitigation:

- add golden sample tests or fixtures for multiple pin shapes
- log winning resolver branch and selected final video URL

### Risk 3: Packaged Sidecar Size Or Startup Cost

Mitigation:

- accept size cost for MVP
- optimize freezer choice later only if real release pain appears

## Rollout Plan

### Phase 1

- implement bundled `pin-dl` for Windows and macOS in the same milestone
- switch Rust to sidecar launch
- keep Pinterest video route enabled only if sidecar resolves successfully

### Phase 2

- add sidecar version display/update work after the downloader path is stable
- add smoke checks in CI

### Phase 3

- optionally harden the updater flow for the FlowSelect-built sidecar

## Acceptance Criteria

- Clicking a Pinterest video pin download button downloads the exact current pin video.
- Pasting a Pinterest video pin URL downloads the exact current pin video.
- Pinterest image pins continue through the image flow.
- The app no longer requires host Python for Pinterest video download in packaged builds.
- Rust logs show the selected pin ID, selected video URL, sidecar spawn, progress, and final output path.
- No top-level `ffmpeg` fallback branch remains in FlowSelect Pinterest download logic.

## Review Questions

No phase-1 design questions remain open after review.

Working assumptions locked for implementation:

1. canonical-page JSON extraction is the primary resolver source
2. Pinterest internal API resolution is a secondary recovery path
3. Windows and macOS sidecars ship in the same milestone
4. sidecar version display/update work is deferred to phase 2
