# Pinterest Implementation Checklist

## Status

In progress on 2026-03-10. Windows-side Workstream 6 verification is complete: lint, typecheck, Rust tests, sidecar smoke, exact-pin manual validation, cancel-path validation, image-pin non-regression, extension-entry validation, and Windows portable-package sanity all passed. macOS packaged/runtime validation remains deferred because no suitable macOS test device is currently available.

## Locked Assumptions

- Pinterest video download has one product-level engine: bundled `pin-dl`.
- No top-level `ffmpeg` fallback remains in FlowSelect Pinterest download logic.
- Resolver primary source is canonical-page JSON extraction.
- Pinterest internal API resolution remains a secondary recovery path.
- Windows and macOS sidecars ship in the same milestone.
- Downloader version display/update is deferred to phase 2.

## Execution Order

1. Create the bundled `pin-dl` sidecar source and local build path.
2. Replace Rust runtime spawning with sidecar spawning.
3. Switch resolver primary flow to canonical-page JSON extraction.
4. Clean up extension / desktop Pinterest routing edge cases.
5. Add CI build-and-bundle steps for Windows and macOS.
6. Run cross-platform smoke checks and freeze release gates.

## Workstream 1: Sidecar Source And Build

### Goal

Create a FlowSelect-owned downloader sidecar that wraps upstream `pinterest-dl` and can be built into platform executables.

### Proposed Files

- `src-tauri/pinterest-sidecar/__main__.py`
- `src-tauri/pinterest-sidecar/runtime.py`
- `src-tauri/pinterest-sidecar/progress.py`
- `src-tauri/pinterest-sidecar/version.py`
- `scripts/build-pinterest-sidecar.mjs`
- `scripts/smoke-pinterest-sidecar.mjs`

### Tasks

- Create a Python entrypoint that accepts `--input-json`.
- Parse and validate the explicit current-pin payload contract.
- Construct upstream `pinterest-dl` media/downloader objects from the payload.
- Emit stable stdout lines:
  - `FLOWSELECT_PINTEREST_STAGE`
  - `FLOWSELECT_PINTEREST_PROGRESS`
  - `FLOWSELECT_PINTEREST_RESULT`
- Emit one actionable stderr summary on failure.
- Return stable exit codes for invalid payload, no-video, download-failed, cancelled.
- Add a build script that creates platform executables and copies them into `src-tauri/binaries/`.
- Pin the upstream `pinterest-dl` version in the sidecar build inputs.

### Completion Criteria

- A local command can build a Windows/macOS sidecar without relying on manual steps.
- The sidecar runs from a JSON payload and prints a final output path on success.
- The sidecar no longer depends on host Python at app runtime.

## Workstream 2: Rust Sidecar Integration

### Goal

Replace the current Python-script spawn path with a bundled sidecar binary path, while preserving queue, progress, cancel, and completion semantics.

### Existing Files To Change

- `src-tauri/src/lib.rs`
- `src-tauri/tauri.conf.json`

### Tasks

- Add `pinterest_downloader_binary_filename()`.
- Add `pinterest_downloader_binary_path(app)`.
- Replace `python_binary_path()` and `pinterest_runtime_script_path()` usage in the Pinterest download path.
- Write the sidecar payload JSON to temp storage before spawn.
- Spawn the bundled sidecar binary instead of `python.exe <script>`.
- Parse sidecar stdout prefixes into FlowSelect progress updates.
- Keep the watchdog, but tie it to sidecar stage/progress heartbeats.
- Preserve cancel behavior by killing the sidecar process and emitting one terminal completion event.
- Keep trace logging for spawn, stage, result, failure, and watchdog timeout.

### Cleanup Tasks

- Remove the old `video_url -> ffmpeg` runtime branch from the Pinterest path.
- Remove host-Python dependency from packaged Pinterest downloads.
- Retire or replace `src-tauri/binaries/pinterest-runtime.py` once sidecar parity is reached.

### Completion Criteria

- Packaged and dev builds resolve a bundled Pinterest downloader binary.
- Pinterest progress still updates in the UI.
- All terminal Pinterest paths emit `video-download-complete` exactly once.

## Workstream 3: Resolver Refactor

### Goal

Make current-pin resolution stable and correct before the sidecar starts downloading.

### Existing Files To Change

- `src-tauri/src/lib.rs`

### Tasks

- Change resolver ordering:
  - canonical-page HTML fetch
  - embedded JSON extraction
  - current-pin object scoring
  - API recovery path only if page JSON fails
- Promote `extract_pinterest_json_blocks()` and current-pin matching to the primary flow.
- Keep the exact current `pin_id` as a hard filter during candidate selection.
- Preserve image-only detection so Pinterest image pins stay on the image flow.
- Keep secondary API recovery for cases where canonical page JSON is insufficient.
- Remove broken-field dependence from the primary resolver path.
- Reduce noisy fallbacks and log which resolver branch succeeded.

### Resolver Validation Matrix

- direct video pin with top-level video metadata
- carousel pin whose active slot contains the video
- image-only pin
- page with cookies present
- page without cookies where content is still public

### Completion Criteria

- The resolver can select the exact current pin video without depending on the broken `pin.images.orig` field request.
- Resolver traces clearly identify the winning source and selected final video URL.
- Public image-only pins do not enter the Pinterest video pipeline.

## Workstream 4: Frontend And Extension Alignment

### Goal

Keep Pinterest detection and desktop routing aligned with the new Rust-plus-sidecar backend.

### Existing Files To Change

- `browser-extension/pinterest-detector.js`
- `browser-extension/background.js`
- `browser-extension/manifest.json`
- `src/App.tsx`
- `src/utils/videoUrl.ts`

### Tasks

- Keep the hardened Pinterest detector that avoids image-card false positives.
- Ensure the extension always sends canonical `pageUrl` for Pinterest.
- Keep `videoUrl` and `videoCandidates` as hints, not the source of truth.
- Confirm desktop paste/drag routing sends Pinterest video pins into the Pinterest backend path.
- When drag HTML exposes Pinterest media hints, forward `pageUrl` / `videoUrl` / `videoCandidates` through `queue_video_download` instead of relying on backend re-resolution alone.
- Confirm desktop image-pin behavior remains on the existing image path.
- Remove assumptions that direct media URLs are sufficient to skip backend resolution.

### Completion Criteria

- Clicking the Pinterest button queues one download for supported video pins.
- Pasting or dropping a Pinterest image pin does not regress current image handling.
- Pasting or dropping a Pinterest video pin enters the Pinterest video path.

## Workstream 5: CI And Release Packaging

### Goal

Build and ship `pin-dl` sidecars for Windows and macOS in the same release pipeline as the app.

### Existing Files To Change

- `.github/workflows/release.yml`
- `src-tauri/tauri.conf.json`

### Tasks

- Add a pre-build sidecar build step on `windows-latest`.
- Add matching sidecar build steps on both macOS runners.
- Output binaries into `src-tauri/binaries/` before `npm run tauri build`.
- Use a stable naming convention:
  - `pinterest-dl-x86_64-pc-windows-msvc.exe` or final agreed equivalent
  - `pinterest-dl-x86_64-apple-darwin`
  - `pinterest-dl-aarch64-apple-darwin`
- Keep Tauri resource globs aligned with the final names.
- Ensure portable ZIP packaging copies the Windows sidecar into `binaries/`.
- Add a smoke step that runs the sidecar with `--help` or a minimal payload before the app build.

### Completion Criteria

- Release builds produce app artifacts that already contain the Pinterest sidecar.
- Portable Windows ZIP contains the Pinterest sidecar next to `yt-dlp`, `deno`, and `ffmpeg`.
- macOS bundles contain the target-appropriate Pinterest sidecar.

## Workstream 6: Tests And Smoke Checks

### Goal

Prevent regressions and verify exact-pin correctness before release.

### Tasks

- Add unit coverage for Pinterest pin URL parsing and current-pin object selection where practical.
- Add resolver fixtures or captured samples for:
  - top-level video pin
  - carousel video pin
  - image-only pin
- Add a sidecar smoke test against a checked-in sample payload shape.
- Keep existing build checks green:
  - `cargo check --manifest-path src-tauri/Cargo.toml`
  - `npm run typecheck`
- Add manual verification notes for:
  - extension-triggered Pinterest video download
  - desktop pasted Pinterest video URL
  - desktop pasted Pinterest image URL
  - cancel path
  - packaged build sanity on Windows and macOS

### Completion Criteria

- Known Pinterest sample pins pass manual smoke tests.
- Build/type checks pass after the new sidecar integration.
- There is at least one repeatable local smoke path for the sidecar independent of the UI.

### Verification Notes (2026-03-10)

- Automated checks passed:
  - `npm run lint`
  - `npm run typecheck`
  - `npm test`
  - `cargo test --manifest-path src-tauri/Cargo.toml`
  - `npm run smoke:pinterest-sidecar -- --mode binary --target x86_64-pc-windows-msvc`
- Added repeatable resolver/unit coverage for:
  - Pinterest pin URL extraction
  - `__PWS_DATA__` JSON block extraction
  - top-level video fixture resolution
  - carousel current-pin video selection
  - image-only fixture resolution
- Added Pinterest fixtures under `src-tauri/tests/fixtures/pinterest/`:
  - `top-level-video.json`
  - `carousel-video.json`
  - `image-only.json`
- Manual checks passed on Windows:
  - extension-triggered Pinterest video download
  - desktop pasted Pinterest video URL
  - desktop pasted Pinterest image URL
  - cancel path
  - exact current-pin download for public video and carousel samples
  - Windows portable packaged-build sanity
- Deferred:
  - macOS packaged-build sanity and runtime validation

## Workstream 7: Phase-2 Backlog

These items are intentionally deferred until stable download correctness is shipped:

- downloader version display in Settings
- downloader update UX
- automated upstream version-check workflow
- sidecar build-size/startup optimizations

## Immediate First PR Slice

If implementation starts now, the first slice should do only this:

1. add sidecar source skeleton
2. add sidecar build script
3. emit stable stage/result output on a mock payload
4. do not wire the app to it yet

This is the smallest slice that proves the packaging path before resolver and Rust integration work begin.

## Second PR Slice

1. switch Rust Pinterest runtime spawning to the bundled sidecar
2. preserve existing resolver temporarily
3. keep progress/cancel/completion contracts intact

## Third PR Slice

1. make canonical-page JSON the primary resolver source
2. demote internal API resolution to recovery only
3. finish Pinterest image/video routing cleanup

## Final Release Gate

- No host Python dependency remains for packaged Pinterest downloads.
- No top-level `ffmpeg` fallback remains in FlowSelect Pinterest product logic.
- Windows and macOS release workflows both build and bundle the sidecar.
- Exact current-pin download works for at least one public video sample and one carousel video sample.
- Pinterest image flow still works.

Current gate status on 2026-03-10:

- Passed on Windows:
  - no host Python dependency in packaged Pinterest flow
  - no top-level FlowSelect-owned `ffmpeg` fallback in Pinterest product logic
  - exact-pin correctness for public video and carousel samples
  - Pinterest image flow non-regression
- Deferred:
  - macOS workflow/runtime execution on real hardware
