# track: image drag diagnostics and html fallback

## Goal

Track the follow-up work needed to make generic image drag failures diagnosable and to improve drag-drop robustness for pages that expose image content through HTML rather than a direct image URL.

## Background

During diagnosis of a failed drag attempt for `https://www.solarsystemscope.com/textures/download/2k_earth_nightmap.jpg`, two gaps were confirmed:

* The image drag/download path does not currently emit support-log runtime evidence, so image failures are mostly invisible in exported diagnostic logs.
* Generic image drag handling relies on `text/uri-list` / `text/plain` image URL detection and does not have a general `text/html -> <img src>` fallback outside Pinterest-specific logic.

The target URL also returned `403 Forbidden` with `Content-Type: text/html` when fetched through the current backend image-download path, so future diagnostics should make it easier to distinguish:

* frontend drag extraction failure
* backend request rejection by the origin site

## Requirements

* Add runtime diagnostic events for the image download path.
* Add runtime diagnostic events for the data-url save path where useful.
* Ensure exported support logs can surface image drag/image download failures the same way they already surface video downloader failures.
* Add a generic drag-drop fallback that can extract an image source from `text/html` when no usable direct image URL is present.
* Keep existing Pinterest-specific handling intact; generic fallback should complement it rather than replace it.
* Preserve current drag-drop behavior for file drops, direct image URLs, and Pinterest pins.

## Acceptance Criteria

* [ ] A failed generic image drag produces diagnosable runtime evidence in the exported diagnostic log.
* [ ] A successful generic image download also leaves enough runtime breadcrumbs to confirm which path was taken.
* [ ] When drag data only exposes HTML with an image element, FlowSelect can still attempt image download via extracted `img src`.
* [ ] Existing Pinterest drag flows continue to work.
* [ ] Existing direct image URL and local file drag flows continue to work.

## Proposed Work

1. Instrument `download_image` with runtime log events for start, failure reason, and success outcome.
2. Optionally instrument `save_data_url` with matching lightweight runtime events.
3. Extend generic `handleDrop` logic in `src/App.tsx` with a non-Pinterest HTML image extraction fallback before giving up on image handling.
4. Verify that the support-log runtime evidence filter retains the new image-related warning/terminal events.

## Technical Notes

* Frontend drop entry:
  * `src/App.tsx`
* Backend image handlers:
  * `src-tauri/src/lib.rs`
  * `download_image`
  * `save_data_url`
* Existing support-log runtime evidence pipeline:
  * `src-tauri/src/lib.rs`
  * `append_runtime_log_event`
  * `build_support_log_runtime_evidence_lines`
