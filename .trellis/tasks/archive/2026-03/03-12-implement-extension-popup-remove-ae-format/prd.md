# implement extension popup remove ae format

## Goal

Implement Phase 3 of the redesign by removing the browser extension popup's standalone `AE Format` control, keeping the existing `Highest / Balanced / Saver` quality options, and teaching the `Highest` trade-off with a compact contextual hint instead of a second toggle.

## Source Decision Context

This task is Phase 3 extracted from:

* [brainstorm PRD](D:/FlowSelect/.trellis/tasks/03-11-brainstorm-redesign-extension-ae-format-option/prd.md)
* [backend Phase 1 PRD](D:/FlowSelect/.trellis/tasks/03-11-implement-backend-transcode-queue-model/prd.md)
* [desktop Phase 2 PRD](D:/FlowSelect/.trellis/tasks/03-11-implement-desktop-transcode-queue-ui/prd.md)

Product decisions already fixed before implementation:

* Keep the popup quality labels as `Highest / Balanced / Saver`
* Remove the standalone `AE Format` toggle from the popup
* Do not rename the three quality options
* When a finished download is not AE-safe, FlowSelect now auto-enqueues a transcode task
* The desktop app already exposes a separate transcode queue in Phase 2
* The popup should teach the `Highest` trade-off with a short hint instead of asking users to decide via an AE toggle

## Existing Extension Reality

Current popup implementation in:

* [popup.html](D:/FlowSelect/browser-extension/popup.html)
* [popup.js](D:/FlowSelect/browser-extension/popup.js)
* [popup.css](D:/FlowSelect/browser-extension/popup.css)

still renders:

* one `Quality` section
* one separate `AE Format` card with a toggle

Current extension data flow in:

* [direct-download-quality.js](D:/FlowSelect/browser-extension/direct-download-quality.js)
* [background.js](D:/FlowSelect/browser-extension/background.js)

still stores and syncs:

* `defaultVideoDownloadQuality`
* `aeFriendlyConversionEnabled`

Current extension locale files in:

* [locales/en/extension.json](D:/FlowSelect/locales/en/extension.json)
* [locales/zh-CN/extension.json](D:/FlowSelect/locales/zh-CN/extension.json)

still include the old `AE Format / Original / AE / Slower finish` copy.

The popup remains space-constrained at roughly `236px` width, so the replacement hint must stay compact.

## Scope

In scope:

* Remove the popup `AE Format` card from [popup.html](D:/FlowSelect/browser-extension/popup.html)
* Remove the popup toggle behavior from [popup.js](D:/FlowSelect/browser-extension/popup.js)
* Adjust popup layout/styling in [popup.css](D:/FlowSelect/browser-extension/popup.css)
* Add a compact contextual `Highest` hint in the popup
* Update extension locale copy in:
  * [locales/en/extension.json](D:/FlowSelect/locales/en/extension.json)
  * [locales/zh-CN/extension.json](D:/FlowSelect/locales/zh-CN/extension.json)
* Run locale sync so generated copies stay aligned:
  * `browser-extension/locales/...`
  * `src-tauri/resources/locales/...`
* Remove or deprecate popup-side AE preference wiring in:
  * [direct-download-quality.js](D:/FlowSelect/browser-extension/direct-download-quality.js)
  * [background.js](D:/FlowSelect/browser-extension/background.js)

Out of scope:

* Desktop main-window UI changes in [App.tsx](D:/FlowSelect/src/App.tsx)
* Backend queue model changes in [lib.rs](D:/FlowSelect/src-tauri/src/lib.rs), unless a small compatibility fix is truly required
* Reworking yt-dlp quality selection itself
* A larger settings-page cleanup outside the extension popup flow

## Requirements

### Popup UI

* Keep the current `Quality` section and the three existing option labels.
* Remove the separate `AE Format` section entirely.
* Add one compact explanatory hint associated with `Highest`.
* The hint should appear contextually when `Highest` is selected.
* The hint should explain the product reality in user language:
  * some high-quality videos may download first
  * then automatically enter the transcode queue
* The hint should not reintroduce an AE-style binary choice.
* The popup should remain visually compact and not become denser than the current layout.

### Popup Behavior

* Quality selection should keep working exactly as before.
* The popup should no longer read or write the AE toggle state during render.
* The popup should no longer expose any clickable AE compatibility control.

### Extension Preference Wiring

Preferred end state:

* extension popup code no longer depends on `aeFriendlyConversionEnabled`
* extension sync/request payloads no longer actively send `aeFriendlyConversionEnabled`

If the implementing window finds a short-term compatibility constraint:

* it may retain a no-op compatibility fallback internally
* but the value must not remain user-configurable in the popup
* and the PR should document why the field was temporarily kept

### Locale Copy

* Remove old AE toggle copy from the popup-facing locale keys if they are no longer used.
* Add locale keys for the new `Highest` hint.
* Keep English and Simplified Chinese aligned.
* After locale edits, sync generated locale artifacts.

## Suggested Copy Direction

The exact wording can be refined during implementation, but the meaning should stay close to:

* English:
  * `Some high-quality videos may enter the transcode queue after download.`
* Simplified Chinese:
  * `部分高画质视频下载后会自动进入转码队列。`

The hint should communicate a downstream workflow consequence, not a new setting.

## Suggested Implementation Approach

1. Remove the AE card markup from [popup.html](D:/FlowSelect/browser-extension/popup.html).
2. Add a lightweight hint container near the quality section.
3. Update [popup.js](D:/FlowSelect/browser-extension/popup.js) so:
   * it renders the quality grid
   * it conditionally renders the `Highest` hint
   * it no longer loads or saves AE toggle state
4. Trim unused popup styling and add any small hint styling in [popup.css](D:/FlowSelect/browser-extension/popup.css).
5. Clean up extension locale keys and add new hint strings.
6. Update extension background/preferences code so stale popup-side AE wiring is removed or explicitly deprecated.
7. Run locale sync.

## Acceptance Criteria

* [ ] The extension popup no longer shows an `AE Format` section or toggle.
* [ ] The popup still shows `Highest / Balanced / Saver` unchanged.
* [ ] Selecting `Highest` reveals a compact hint explaining that some downloads may later enter the transcode queue.
* [ ] The hint fits the current popup width without making the popup feel crowded.
* [ ] Popup code no longer reads/writes AE toggle state as part of normal rendering.
* [ ] Extension locale files no longer carry popup copy that is clearly dead after the AE toggle removal, unless temporarily retained for compatibility and documented.
* [ ] Locale sync updates generated locale artifacts consistently.
* [ ] Any remaining `aeFriendlyConversionEnabled` usage is either removed from active extension flows or clearly justified as compatibility-only.

## Verification

Expected verification for this task:

* extension popup manual check:
  * popup opens cleanly
  * quality selection still persists
  * `Highest` shows the new hint
  * `Balanced` and `Saver` do not show the hint
* locale sync/build verification used by the repo
* quick request-path sanity check that extension downloads still queue correctly after removing popup-side AE wiring

## Notes For The Implementing Window

* Phase 1 and Phase 2 are already done; do not pull the desktop queue redesign back into this task.
* The important product move here is subtraction: remove the misleading control rather than replacing it with another complex switch.
* If removing `aeFriendlyConversionEnabled` from background payloads reveals a backend dependency, document that precisely instead of silently restoring the old UI.
