# brainstorm: reliable precise video download trigger

## Goal

Replace the current per-site injected download-button trigger with a more reliable and lower-maintenance precise-selection flow for browser downloads, while keeping drag-and-drop and pasted-link flows unchanged. The new flow should let users target the specific media they mean on the current page without falling back to a noisy "all videos on page" waterfall UI, while preserving the existing desktop download pipeline and site-specific extractor behavior where it already works well.

## What I already know

* The current extension is heavily centered around per-site content scripts and injected controls. `browser-extension/manifest.json` registers dedicated detectors for YouTube, Bilibili, Douyin, Xiaohongshu, Pinterest, Zhihu, Instagram, Weibo, and Twitter/X.
* The extension already has a stable downstream contract for precise video selection. `browser-extension/background.js` accepts `video_selection`, normalizes `pageUrl` / `videoUrl` / `videoCandidates` / `selectionScope`, attaches cookies, and forwards the payload to the desktop app as `video_selected_v2`.
* The desktop side already understands `selectionScope: "current_item"`. That metadata flows through `src/core/types/raw-download-input.ts`, `src/core/types/download-intent.ts`, and into runtime behavior such as `yt-dlp --no-playlist` in `src/electron-runtime/ytDlpDownload.ts`.
* Existing drag-and-drop and pasted-link flows are already considered precise enough for this product goal. The redesign target is specifically the injected-button trigger path.
* Popup today is not a video selector. `browser-extension/popup.js` currently exposes connection status and quality preference only.
* Instagram already uses an injected-button approach. `browser-extension/instagram-detector.js` clones native action buttons and sends the current post/reel page URL via `video_selection`.
* Instagram page URLs are already supported on the desktop side through the gallery-dl-first fallback chain. `src/sites/providers.test.ts` and `src/electron-runtime/service.test.ts` both assert that `https://www.instagram.com/...` routes through `gallery-dl-supported` first, then `yt-dlp`.
* The current repo does not yet use `chrome.contextMenus` or `chrome.webRequest` in the extension manifest/background path.
* The current repo already has some direct-candidate logic for specific sites such as Pinterest and Xiaohongshu, but that logic is site-specific rather than generic.
* External expert guidance you summarized recommends switching primary trigger strategy toward `Context Menus API` plus a popup-based "current playing video" shortcut, and treating global request sniffing as optional quality enhancement rather than the default UX.

## Assumptions (temporary)

* We should preserve the existing desktop download contract and reuse `video_selection` / `video_selected_v2` instead of inventing a new cross-layer payload.
* The problem to solve first is injected-trigger reliability and maintenance cost, not drag/paste accuracy and not building a universal media sniffer UI.
* We can accept a hybrid model where some sites still keep custom injected controls for special features like screenshotting or clip ranges, while the main "download this video" trigger becomes generic.
* For Instagram, a page-URL-first route remains necessary even if a context menu or focused-video flow can also surface a direct `srcUrl`, because extractor-based flows are already working and are safer for MSE/segmented media.

## Open Questions

* None at the product-principle level. Remaining implementation details should be finalized in the technical approach.

## Requirements (evolving)

* Precise download must be possible without rendering a waterfall list of all page videos.
* The redesign scope is the injected-button trigger path only; drag-and-drop and pasted-link flows are not being reworked in this task.
* The new trigger path should avoid per-site UI placement work such as selectors, anchor cloning, z-index tuning, and shadow DOM adaptation.
* The solution should reuse the existing background-to-desktop selection pipeline where possible.
* Instagram/Reels coverage is required for the new design.
* Current-item semantics must continue to be preserved for sites where playlist-safe behavior matters.
* MVP should use `contextMenus` plus popup "current video" entry points instead of keeping injected download buttons as the core trigger.
* MVP should include a generic robustness layer so selection is not based on a single weak signal when pages use blob/MSE playback, multiple visible videos, or mismatched page/media URLs.
* Existing injected buttons should be retired from sites where they only serve as a download trigger, because the product cannot scale by adapting buttons site by site for the thousands of sites supported by yt-dlp and gallery-dl.
* Existing injected buttons may remain only where they deliver advanced in-player actions that generic triggers cannot replace well.
* Generic triggers should produce a single precise selection request, not a page-wide media waterfall UI.

## Acceptance Criteria (evolving)

* [ ] A user can trigger download of one intended video on the current page without choosing from a waterfall list.
* [ ] The trigger path no longer depends on injecting a download button into each site's native player chrome for the core MVP flow.
* [ ] Instagram post/reel pages remain supported by the new trigger path.
* [ ] Existing downstream routing (`video_selection` -> desktop queueing) remains compatible.
* [ ] The MVP defines how generic trigger signals are combined before queueing, without regressing the existing precise drag/paste flows.
* [ ] The PRD defines which old injected-button paths stay, which are replaced, and which are explicitly out of scope for MVP.

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Out of Scope (explicit)

* Building a full media waterfall browser as the primary UX
* Replacing all site-specific extractor/provider logic on desktop
* Solving every non-`<video>` / canvas / DRM / encrypted streaming case in MVP
* Designing a brand-new desktop download architecture

## Research Notes

### What similar extension/platform APIs support

* Chrome's official `chrome.contextMenus` API supports `contexts: ["video"]`, and click data can include `mediaType`, `pageUrl`, and `srcUrl`.
* Chrome's official `activeTab` docs state that a user gesture such as clicking the extension action or a context menu item can temporarily grant access to the current tab without adding a persistent broad warning.
* Chromium-derived WebExtensions docs describe `targetElementId` on context-menu click data plus `menus.getTargetElement()` in content scripts, which suggests a path to identify the exact right-clicked DOM element rather than only trusting `srcUrl`.
* Chrome MV3 still supports observing network traffic with `chrome.webRequest`, but it requires explicit `webRequest` permission plus host permissions. This is useful for optional media-candidate enrichment, not required for the basic precise-trigger UX.

### Constraints from our repo/project

* Manifest currently lacks `contextMenus` and `webRequest` permissions.
* Popup currently has no active-tab inspection logic.
* Background already centralizes cookie capture, site hint derivation, routing normalization, and app queueing, so trigger-layer changes should stay thin.
* Instagram page URLs already route well through gallery-dl-first behavior, which lowers the need to extract a direct media URL in MVP.

### Feasible approaches here

**Approach A: Context menu primary + popup current-video secondary** (Recommended)

* How it works:
  Add a `Download with FlowSelect` context menu for `video` context, forward `pageUrl` / `srcUrl` / element context into the existing `video_selection` path, add a popup action that inspects the active tab for the currently playing / visible `HTMLVideoElement`, and combine both with a generic candidate-enrichment layer before queueing to desktop.
* Pros:
  Removes per-site button placement as the main download UX, keeps user intent explicit, works well for pages with one main playing video, and fits the existing background contract.
* Cons:
  Still needs a clear rule for how to combine right-click target, current player, and canonical page URL into one resilient request.

**Approach B: Popup current-video primary + context menu optional**

* How it works:
  Put "download current video" inside the action popup, run a tab-scoped script to locate the best active `HTMLVideoElement`, and use context menu only as an auxiliary path later.
* Pros:
  Lower manifest surface than adding a new persistent menu-first UX and easier to keep branded/consistent.
* Cons:
  Less direct than right-click, weaker for pages with several candidate videos, and can feel opaque when selection heuristics pick the wrong element.

**Approach C: Keep injected buttons, but centralize generic video detection**

* How it works:
  Retain page injection as the primary UX but replace most per-site DOM anchoring with one generic overlay/observer strategy.
* Pros:
  Keeps an in-player action affordance.
* Cons:
  Still leaves the project in the DOM adaptation business, which is the current maintenance pain point and likely fails the goal.

## Technical Notes

* Task created at `.trellis/tasks/04-08-reliable-precise-video-download-trigger/`.
* Repo inspection used `rg` as a fallback because `ace-tool` is not available in this session.
* Key files inspected:
  * `browser-extension/manifest.json`
  * `browser-extension/background.js`
  * `browser-extension/popup.js`
  * `browser-extension/content-script.js`
  * `browser-extension/instagram-detector.js`
  * `browser-extension/video-selection-routing.js`
  * `src/sites/providers.test.ts`
  * `src/sites/gallery-dl-supported.ts`
  * `src/electron-runtime/service.ts`
  * `src/electron-runtime/service.test.ts`

## Decision (ADR-lite)

**Context**: The current per-site injected-button approach creates high maintenance cost because trigger placement has to be adapted for each site's DOM and player UI. Drag-and-drop and pasted-link flows are already accurate enough and are not the redesign target.

**Decision**: MVP will move the core precise-download trigger to `contextMenus` plus popup "current video", and it will include a generic candidate-enrichment layer instead of relying on a single signal.

**Consequences**: This reduces per-site UI work substantially and makes the architecture scalable to the long tail of sites already supported by yt-dlp and gallery-dl. Injected buttons should survive only where they provide meaningful advanced in-player actions rather than basic download entry.

## Technical Approach

Introduce a generic browser-trigger layer in the extension and keep the existing desktop queueing/runtime architecture intact.

Core trigger paths:

* `Context menu`: add `Download with FlowSelect` on `video` context so a user can explicitly target the media element under the cursor.
* `Popup current video`: add a one-click action in the popup that asks the active tab for the best current `HTMLVideoElement` candidate when right-click is inconvenient or blocked.
* `Generic candidate enrichment`: combine available signals into one request payload:
  * page URL / canonical content URL
  * right-clicked media `srcUrl` when available
  * active/currently playing visible video metadata from content script
  * optional media candidates discovered from DOM or future network observation

Routing principle:

* Keep page URL in the request whenever available so extractor-first sites like Instagram can still route through `gallery-dl` / `yt-dlp`.
* Attach direct media URLs and candidates as hints rather than forcing the entire system to route by raw CDN URL.
* Preserve `selectionScope: "current_item"` for generic trigger requests so playlist-safe handling remains intact.

Injected-button retention policy:

* Keep injected controls only on sites where they unlock feature value beyond plain download, such as screenshot capture, clip IN/OUT selection, or other player-coupled actions.
* Gradually remove injected download-only controls from sites once the generic trigger path is proven stable.
