# Brainstorm: Capture Instagram Links For Gallery-dl Downloads

## Goal

Make Instagram downloads practical in FlowSelect by adding a low-friction way for the browser extension to capture the current Instagram page's usable URL and hand it to the existing FlowSelect download pipeline, instead of trying to solve generic media drag unlocking.

## What I already know

* The original idea was a generic "break non-draggable media restriction" feature, but current evidence suggests the real recurring problem is Instagram-specific.
* The user no longer sees broad demand for a generic drag-unlock feature; the active pain point is "I can't easily get the link from Instagram".
* The desktop app already accepts pasted URLs and routes them through site providers.
* `www.instagram.com` is already recognized by FlowSelect's gallery-dl site support list in [`src/sites/gallery-dl-support.ts`].
* The `gallery-dl-supported` provider already routes supported hosts through gallery-dl first and then yt-dlp fallback in [`src/sites/gallery-dl-supported.ts`].
* The generic download provider already works from a source URL once one is available in [`src/sites/generic.ts`].
* The browser extension already has the permissions and architecture needed for current-tab actions:
  * `activeTab` in [`browser-extension/manifest.json`]
  * popup UI in [`browser-extension/popup.html`] and [`browser-extension/popup.js`]
  * background worker with `chrome.tabs.query(...)` in [`browser-extension/background.js`]
* Current extension UX is centered on connection status and quality preferences; there is not yet a generic "send current page URL to FlowSelect" action in the popup.

## Assumptions (temporary)

* For Instagram, the fastest product win is URL capture, not raw media extraction.
* In many Instagram cases, the current browser tab URL or canonical page URL is sufficient for gallery-dl.
* A lightweight extension entry point is preferable to adding a new site-specific injected button on Instagram pages.

## Open Questions

* None.

## Requirements (evolving)

* Solve the Instagram workflow by adding an in-page Instagram entry point that submits the current item/page URL to FlowSelect without requiring manual link hunting.
* Inject the action into an Instagram-native action area, ideally near the existing share/comment controls.
* When the injected button is clicked, resolve the page URL by preferring canonical URL and falling back to `location.href`.
* Prefer reusing the existing URL-driven desktop download pipeline rather than adding a new Instagram-specific media extraction contract.
* Keep the first implementation Instagram-specific instead of designing a generic all-sites entry-point framework.
* MVP target surfaces are Instagram post detail pages and Reels detail pages.

## Acceptance Criteria (evolving)

* [ ] The MVP defines one clear Instagram in-page action that is faster than manual copy/share.
* [ ] Clicking the injected button feeds an Instagram URL into the existing FlowSelect download pipeline rather than creating a parallel downloader contract.
* [ ] The injected action prefers canonical URL and falls back to `location.href` when canonical is unavailable.
* [ ] The design works on Instagram post detail pages and Reels detail pages.
* [ ] Likely implementation files and constraints are identified.

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Out of Scope (explicit)

* Building a generic all-sites drag-unlock system
* Extracting raw Instagram media URLs from blob/MSE players in the first pass
* Replacing gallery-dl or adding a new Instagram downloader engine
* Solving every Instagram surface (especially complex ephemeral/private cases) in MVP
* Avoiding site-specific UI injection work; this task explicitly accepts Instagram-specific injection

## Research Notes

### What our current repo already supports

* FlowSelect already recognizes Instagram as a gallery-dl-supported host, so a valid Instagram page URL should route to gallery-dl first.
* The browser extension popup already persists preferences and talks to the background worker, so adding one more explicit action is low-friction.
* The background worker already knows how to query the active tab, send structured messages to the app, and reuse the existing connection/retry path.

### Constraints from our repo/project

* Current extension UI does not expose a "download current page" action.
* Current `video_selection` flows are optimized for media URLs/candidates or site-specific detectors; Instagram URL submission may fit better as a page-level submission action than as a drag payload.
* Instagram is a SPA and may not always make link discovery obvious in the visible UI, so relying on "copy share link manually" is the weak point.

### Feasible approaches here

**Approach A: Popup action submits current tab URL** (Recommended)

* How it works:
  Add a popup button like "Download current page with FlowSelect". When clicked, the extension reads the active tab URL and sends it into the existing app pipeline.
* Pros:
  Smallest implementation, no Instagram page injection required, likely good enough for post/reel/profile URLs, reusable for other gallery-dl-supported sites.
* Cons:
  Depends on the active tab URL already being the canonical/useful URL. If Instagram sometimes keeps a less useful SPA URL, this may be insufficient alone.

**Approach B: Popup action resolves canonical Instagram URL first**

* How it works:
  From the popup/background, ask a lightweight Instagram content script for `location.href`, `<link rel="canonical">`, or page metadata, then submit the best normalized URL.
* Pros:
  More robust for SPA/share-link weirdness while still avoiding per-page injected UI.
* Cons:
  More moving parts than Approach A and slightly more site-specific logic.

**Approach C: Page-level injected button/action for Instagram only**

* How it works:
  Inject a small action on Instagram pages that sends the current page URL to FlowSelect.
* Pros:
  Most direct user experience on-page.
* Cons:
  Reintroduces site-specific UI injection work and requires DOM/re-render adaptation.

## Decision (ADR-lite)

**Context**: The original brainstorm started from a generic "break drag restriction" idea, but the active pain narrowed to Instagram. Popup-driven URL submission would be lower-maintenance, but the chosen product direction is an Instagram in-page entry point because it best matches the desired user workflow.

**Decision**: Use an Instagram page-level injected button/action as the MVP entry point.

**Consequences**:
* We accept Instagram-specific DOM adaptation work.
* We should optimize for cloning/aligning with Instagram's native action-button structure instead of inventing custom styling.
* The injected action will prefer canonical URL and fall back to `location.href`.
* MVP scope is limited to Instagram post detail pages and Reels detail pages.

## Technical Notes

* Relevant code already proving Instagram routing support:
  * [`src/sites/gallery-dl-support.ts`]
  * [`src/sites/gallery-dl-supported.ts`]
  * [`src/sites/providers.test.ts`]
* Likely extension touchpoints for MVP:
  * `browser-extension/manifest.json`
  * `browser-extension/background.js`
  * new Instagram detector/content script
  * possibly shared extension button styling helpers if we reuse existing patterns
* Likely app/runtime touchpoints:
  * existing `video_selection` or adjacent app-submission path in `browser-extension/background.js`
  * desktop URL ingestion already handled through current providers; likely no new downloader engine required
* Product direction change:
  * The task has narrowed from "generic drag unlock" to "Instagram in-page URL capture / submit UX"
* User-provided target injection evidence:
  * The desired insertion point is immediately to the right of Instagram's native share button in the post/reel action row.
  * A captured share-button node was provided and should be treated as the primary style/template reference for the MVP.
  * A second captured node from an Instagram Reels page was also provided, confirming that reels use a different action-area structure and likely need a separate mount strategy from standard post detail pages.
  * Current outerHTML sample:

```html
<div class="x1i10hfl x1qjc9v5 xjbqb8w xjqpnuy xc5r6h4 xqeqjp1 x1phubyo x13fuv20 x18b5jzi x1q0q8m5 x1t7ytsu x972fbf x10w94by x1qhh985 x14e42zd x9f619 x1ypdohk xdl72j9 x2lah0s x3ct3a4 xdj266r x14z9mp xat24cr x1lziwak x2lwn1j xeuugli x1n2onr6 x16tdsg8 x1hl2dhg xggy1nq x1ja2u2z x1t137rt x1fmog5m xu25z0z x140muxe xo1y3bh x3nfvp2 x1q0g3np x87ps6o x1lku1pv x1a2a7pz x1epzrsm xpzwpp9 xus2keu x1y1aw1k xf159sx xwib8y2 xmzvs34" role="button" tabindex="0"><svg aria-label="分享" class="x1lliihq x1n2onr6 xyb1xck" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24"><title>分享</title><path d="M13.973 20.046 21.77 6.928C22.8 5.195 21.55 3 19.535 3H4.466C2.138 3 .984 5.825 2.646 7.456l4.842 4.752 1.723 7.121c.548 2.266 3.571 2.721 4.762.717Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="2"></path><line fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="7.488" x2="15.515" y1="12.208" y2="7.641"></line></svg><div class="x1ey2m1c xtijo5x x1o0tod xg01cxk x47corl x10l6tqk x13vifvy x1ebt8du x19991ni x1dhq9h x1fmog5m xu25z0z x140muxe xo1y3bh" role="none" data-visualcompletion="ignore"></div></div>
```

* Recommended mount strategy for MVP:
  * For post detail pages:
    * Detect the native share button node or its nearest stable horizontal action-row parent.
    * Clone the share-button shell, replace the icon/title/aria label, and insert the FlowSelect button immediately after the native share button.
  * For Reels detail pages:
    * Detect the native action-column button shell and mount a FlowSelect button into the same vertical action stack using the reels-specific structure as the reference template.
  * Prefer structural reuse over hand-authored CSS to better survive Instagram visual changes.
