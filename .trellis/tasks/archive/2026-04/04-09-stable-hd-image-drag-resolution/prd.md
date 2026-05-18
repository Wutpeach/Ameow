# brainstorm: stable hd image drag resolution

## Goal

When a user drags an image from a webpage into FlowSelect, the app should resolve the best available image asset consistently instead of often saving a thumbnail or intermediate-size URL. The immediate motivation is Weibo image drag, where thumbnail/card drag may expose `orj360`, gallery-open drag may expose `mw690`, and only the "view large image" state exposes `mw2000`. The user also confirmed Google Images shows the same class of problem, so this is not Weibo-specific. We need a stable strategy that can upgrade drag-discovered image URLs to a higher-quality original candidate without forcing the user to manually open deeper viewer states first.

## What I already know

* Current drag entrypoint is `src/App.tsx`, which parses `text/html`, `text/plain`, `text/uri-list`, FlowSelect custom drag payloads, and dropped browser files.
* Generic image HTML parsing already exists in `src/utils/imageDrag.ts`. It prefers higher-score `srcset` entries and can fall back to CSS `background-image:url(...)`.
* The browser extension already has a robust protected-image drag mechanism:
  * content script registers a drag token and page/image context
  * extension background stores the token in a short-lived registry
  * Electron can ask the extension to resolve the drag in-tab, then background-fetch, then desktop-authenticated download
* Xiaohongshu drag already uses a stronger pattern than generic image drag: a tokenized drag payload plus post-drop site-specific resolution that can prefer note-detail media over the raw dragged thumbnail/cover.
* `src/App.tsx` currently forwards `pageUrl` to `download_image` for image drags, which is important for hotlink-sensitive hosts such as `sinaimg.cn`.
* Current generic image resolution picks the dragged URL itself if it looks like an image, otherwise it falls back to `extractImageUrlFromHtml(...)`. There is no generic "upgrade thumbnail/intermediate image URL into best-quality variant" stage yet.
* Browser drag payloads are fundamentally lossy. Many sites deliberately expose only the rendered node's current `src`/thumbnail URL during drag instead of the page's best-quality asset.
* Recent repo history shows adjacent fixes in the same area:
  * `fix(weibo): expand short links before download`
  * `fix(xiaohongshu): harden drag media resolution`
  * `fix(xiaohongshu): resolve tokenized drag detail fallback`

## Assumptions (temporary)

* The desired behavior is "best practical quality from the same media asset", not "pixel-perfect guarantee of absolute original for every site".
* We can treat Weibo as the first concrete target, but the final design should acknowledge that Google Images and likely other sites suffer from the same drag-payload limitation.
* It is acceptable to add a site-specific upgrader when a purely generic heuristic would be too fragile.
* We should preserve the current one-drop UX. Users should not have to explicitly click "view large image" before dragging.

## Open Questions

* MVP scope choice: should this task solve Weibo first, or introduce a reusable image-variant-upgrade pipeline now because Google Images is already a second confirmed case?

## Requirements (evolving)

* Dragging a Weibo image should prefer a higher-quality asset than the raw dragged thumbnail/intermediate URL when a deterministic upgrade rule exists.
* The solution should explicitly distinguish between:
  * pages where a better URL can be derived from the dragged URL itself
  * pages where only page-context/extension-side re-resolution can reveal the large image
* Existing protected-image drag flow must continue to work.
* Existing Xiaohongshu drag flow must not regress.
* Keep `pageUrl` / referer context available for hotlink-sensitive downloads.
* Avoid forcing the renderer to guess blindly when the site-specific resolution can be delegated to extension/background/Electron layers that already have stronger page context.

## Acceptance Criteria (evolving)

* [ ] A Weibo drag that currently yields `orj360` or `mw690` can resolve to a higher-quality variant when the underlying asset key is the same and an allowed larger variant is derivable.
* [ ] Generic public image drags still resolve and download successfully.
* [ ] The design explains why Google Images and similar pages may still require a stronger resolver tier than pure URL rewriting.
* [ ] Protected-image fallback still works when the direct URL download path fails.
* [ ] Xiaohongshu drag video/image resolution behavior remains unchanged.
* [ ] The final strategy documents where image-quality upgrade logic lives and why.

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Out of Scope (explicit)

* A universal crawler that opens every site’s full-screen viewer to discover originals
* OCR / visual matching to discover whether two image URLs refer to the same asset
* Refactoring all existing drag pipelines into one abstraction unless it materially helps this task
* Solving video drag quality in this task

## Technical Notes

* Files inspected:
  * `src/App.tsx`
  * `src/utils/imageDrag.ts`
  * `src/utils/protectedImageDrag.ts`
  * `browser-extension/protected-image-detector.js`
  * `browser-extension/background.js`
  * `electron/main.mts`
  * `.trellis/spec/frontend/type-safety.md`
  * `.trellis/spec/backend/electron-runtime-contracts.md`
* Relevant existing patterns:
  * Generic HTML image extraction and scoring in `src/utils/imageDrag.ts`
  * Tokenized protected-image drag fallback in `browser-extension/protected-image-detector.js` + `browser-extension/background.js`
  * Tokenized site-specific post-drop resolution for Xiaohongshu
* Constraints from current architecture:
  * Renderer sees weak drag signals first (`text/uri-list`, dragged HTML, dropped file payloads)
  * Extension/background has stronger access to page context and authenticated fetch
  * Electron already participates in multi-step fallback orchestration for protected images and Xiaohongshu drags

## Research Notes

### What similar logic already exists in this repo

* Generic scoring works for `srcset` and CSS images, but it only ranks URLs already present in the drag payload.
* Protected-image resolution uses a stronger three-step approach:
  * resolve inside content script/page context
  * fallback to extension background fetch
  * fallback to authenticated desktop download
* Xiaohongshu drag goes further by treating raw drag hints as provisional and re-resolving media from note/detail context.

### Constraints from our repo/project

* The cleanest stable solutions reuse existing extension/background/Electron orchestration rather than putting all logic in renderer-only regexes.
* But adding a full tokenized site-specific resolver for every image host is heavier than a deterministic URL upgrader for hosts with known variant patterns.

### Feasible approaches here

**Approach A: Weibo-specific URL variant upgrader** (Recommended MVP)

* How it works:
  * Add a deterministic normalizer/upgrader for `sinaimg.cn` image URLs, likely in the generic image pipeline before `download_image`.
  * Recognize known size buckets such as `orj360`, `mw690`, `mw2000`, and upgrade toward the best allowed candidate while keeping the same asset id/path tail.
* Pros:
  * Smallest change surface
  * Best match for the concrete user problem
  * Easy to unit test with URL-only fixtures
* Cons:
  * Solves Weibo first, not a reusable pipeline for other hosts
  * Needs careful allowlist so we do not invent invalid variants blindly

**Approach B: Reusable image host quality-upgrade pipeline**

* How it works:
  * Introduce a generic `upgradeDraggedImageUrl(...)` stage with host-specific resolvers, with Weibo as the first resolver.
  * Renderer still handles ordinary extraction, then passes the resolved best candidate to download.
* Pros:
  * Better long-term shape
* Scales to more hosts with similar size-variant URLs
* Better fit now that Google Images is a second confirmed affected case
* Cons:
  * More design work now
  * Slightly higher risk of over-abstracting before the second host is clear

**Approach C: Extension-side site-specific image re-resolution**

* How it works:
  * Copy the Xiaohongshu pattern: attach a tokenized Weibo image drag payload and ask extension/background/page context to re-resolve the best image after drop.
* Pros:
  * Most powerful and potentially most accurate
  * Can use live DOM/page state instead of only URL heuristics
* Cons:
  * Highest implementation cost
  * More cross-layer complexity and more moving parts than this specific Weibo size-bucket issue probably needs
