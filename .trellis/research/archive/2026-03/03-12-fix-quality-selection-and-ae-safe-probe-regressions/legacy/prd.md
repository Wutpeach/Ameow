# fix quality selection and ae-safe probe regressions

## Goal

Fix the first post-redesign regression set after Phases 1-3:

* extension popup quality/runtime behavior does not match the intended `Highest / Balanced / Saver` model during real use
* some downloads that should bypass transcoding still enter the transcode queue because AE-safe probing depends on `ffprobe` being available on the host PATH

This task is a stabilization pass, not a redesign.

## User-Observed Problems

Reported after Phase 3:

1. Selecting `Balanced` or `Saver` still shows the `Highest` hint in the popup.
2. For `https://www.youtube.com/watch?v=iGeXGdYE7UE`, choosing `Highest` downloaded `1920x960` instead of the expected `2160p` tier.
3. After switching from `Highest` to `Balanced`, downloads still flowed into the transcode queue.

## Confirmed Evidence Collected In This Window

### A. Popup source says the hint should only appear for `best`

Current source:

* [popup.html](D:/FlowSelect/browser-extension/popup.html) initializes the hint with `hidden`
* [popup.js](D:/FlowSelect/browser-extension/popup.js) only shows the hint when `selectedValue === "best"`

Implication:

* the observed `Balanced / Saver` hint behavior is either:
  * a real runtime/state bug not visible in static code
  * or a stale extension/reload issue

This task must reproduce in a freshly reloaded extension before changing popup logic.

### B. The YouTube video does expose a 2160p source

`yt-dlp -F https://www.youtube.com/watch?v=iGeXGdYE7UE` shows:

* `401` -> `3840x1920` `2160p` `av01`
* `313` -> `3840x1920` `2160p` `vp9`

The `1920x960` result is the 1080-tier for this specific 2:1 video, not a malformed resolution.

### C. Plain `bestvideo*+bestaudio/best` resolves to 1080 on this URL

Verified locally with the same YouTube extractor args family currently used by FlowSelect:

* without explicit sort override, yt-dlp resolved to `137+140-5` -> `1920x960`
* with explicit `-S "res,codec:h264,acodec:aac,ext"`, yt-dlp resolved to `313+251-5` -> `3840x1920`

Implication:

* if the running app still downloads `1920x960` under `Highest`, the effective runtime path did not actually apply the intended `Best` resolution-first sorting behavior
* this may be because:
  * the request did not truly run as `best`
  * the runtime build is stale
  * or the `Best` sort path was skipped in the actual download branch

### D. AE-safe probing currently depends on host PATH `ffprobe`

Confirmed in current code:

* [lib.rs](D:/FlowSelect/src-tauri/src/lib.rs) launches `std::process::Command::new("ffprobe")`
* running `ffprobe -version` in this environment fails

Current transcode queue behavior:

* when probing fails in `prepare_transcode_task_from_download(...)`, FlowSelect queues a fallback transcode task instead of concluding the file is already AE-safe

Implication:

* `Balanced` can still enter the transcode queue even for an `MP4 + H.264 + AAC` file if `ffprobe` is not present on PATH

## Scope

In scope:

* Reproduce the popup hint/runtime behavior with a freshly reloaded unpacked extension
* Fix any real popup-side quality state bug if reproduction persists
* Verify the request path actually sends and uses the expected quality selection for YouTube downloads
* Fix AE-safe probing so it uses the app-managed ffprobe path instead of assuming a host PATH binary
* Verify that AE-safe `Balanced` downloads bypass the transcode queue after the probe fix
* Add any small logging/diagnostic improvements needed to make future quality-selection debugging clearer

Out of scope:

* New queue UI design work
* Reintroducing any AE toggle
* Large yt-dlp strategy redesign beyond the specific regression
* General downloader architecture changes unrelated to these two regressions

## Requirements

### 1. Popup Quality Hint Consistency

* Reproduce with the latest unpacked extension loaded into the browser.
* If the bug reproduces:
  * ensure `Balanced` and `Saver` do not show the `Highest` hint
  * ensure `Highest` does show the hint
* If the bug does not reproduce after a clean reload:
  * document that this was a stale runtime issue
  * avoid unnecessary code churn in popup logic

### 2. Effective Quality Selection Verification

* Verify that the extension request path sends the correct `ytdlpQualityPreference` after popup selection changes.
* Verify that the desktop backend receives and uses the expected quality value.
* For the reported YouTube URL:
  * `Highest` should actually follow the `Best` runtime policy
  * `Balanced` should stay on the `1080p MP4/H.264/AAC` path
* If the runtime still lands on `1920x960` for `Highest`:
  * identify the exact branch where the explicit `Best` sort override is lost or bypassed
  * fix that branch

### 3. AE-Safe Probe Fix

* Replace host-PATH `ffprobe` assumptions with the app-managed/bundled ffprobe resolution strategy.
* Probe failure should no longer happen merely because the user machine lacks a global `ffprobe` install.
* After the fix:
  * AE-safe `MP4 + H.264 + AAC` downloads should return `Ok(None)` from transcode-task preparation
  * they should not auto-enter the transcode queue

### 4. Regression Validation

* Re-check the reported YouTube URL after fixes.
* Confirm the transcode queue is only used when the downloaded file is actually not AE-safe.

## Suggested Implementation Approach

1. Reproduce popup/runtime behavior after reloading the unpacked extension.
2. Inspect actual stored quality values in extension storage if popup behavior is still inconsistent.
3. Trace the `ytdlpQualityPreference` value through:
   * popup
   * extension storage
   * background request payload
   * backend request parsing
   * yt-dlp invocation branch
4. Fix `probe_media_summary(...)` so it resolves ffprobe through the app-managed binary path instead of `Command::new("ffprobe")`.
5. Re-test `Balanced` on a known AE-safe YouTube case.
6. Re-test `Highest` on the reported URL and confirm whether the runtime path now reaches the intended higher-resolution source.

## Acceptance Criteria

* [ ] `Balanced` and `Saver` do not show the `Highest` hint after a clean extension reload.
* [ ] `Highest` still shows the hint.
* [ ] The effective quality sent by the extension matches the selected popup state.
* [ ] AE-safe probing no longer depends on a host-installed `ffprobe`.
* [ ] A `Balanced` YouTube download that resolves to `MP4 + H.264 + AAC` does not enter the transcode queue.
* [ ] The reported YouTube URL no longer produces a misleading `Highest` result because of a lost/bypassed quality path.
* [ ] Any remaining limitation is documented precisely if the root cause turns out to be external to FlowSelect.

## Verification

Expected verification for this task:

* reload unpacked extension and manually verify popup hint behavior
* manual end-to-end test for `https://www.youtube.com/watch?v=iGeXGdYE7UE`
* one `Balanced` download known to be AE-safe and expected to bypass transcode
* relevant repo checks after code changes:
  * frontend syntax/type checks for extension files
  * backend check/test coverage as appropriate

## Notes For The Implementing Window

* Do not assume the popup hint issue is a code bug until you reproduce it on a fresh extension reload.
* The `ffprobe` path issue is already strongly confirmed and should be treated as a real backend bug.
* If the `Highest` issue turns out to be partly a stale runtime/build mismatch, document that cleanly instead of forcing a speculative selector rewrite.
