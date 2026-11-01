# brainstorm: protected image browser-context fallback

## Goal

Enable FlowSelect to save dragged images from sites that reject native/backend direct downloads, by falling back to a browser-context-assisted path that can access image bytes from the page session instead of replaying only the raw image URL from the desktop app.

## What I already know

* Generic image drag diagnostics are now available and confirmed that `https://www.solarsystemscope.com/textures/download/2k_earth_nightmap.jpg` reaches the backend image path.
* The current desktop-side `download_image` request for that URL fails with `HTTP error: 403 Forbidden`.
* External verification from the local environment shows the same URL currently returns `403` with `Content-Type: text/html`, even when common `User-Agent` and same-site `Referer` headers are added.
* This means the current failure is no longer "drag extraction failed"; it is "origin site rejected backend/native replay of the image URL".
* The browser extension already has a working `save_data_url` path used for screenshot capture:
  * extension `background.js` sends `save_data_url`
  * desktop backend `save_data_url` persists the bytes locally
* The browser extension already enriches Pinterest drag payloads by writing custom data into `dataTransfer`.
* The extension has `host_permissions: ["<all_urls>"]`, but content scripts are currently injected only for a handful of supported video sites, not generic pages such as Solar System Scope.
* The desktop drop handler in `src/App.tsx` currently resolves dropped image URLs and then calls either `download_image` or `save_data_url` directly; there is no existing protected-image fallback orchestration after a direct image failure.
* The browser extension background already has a request/response transport for extension -> desktop actions (`video_selected`, `save_data_url`) and can also receive desktop-originated broadcast actions (`start_picker`, `stop_picker`, theme/language updates), but there is no existing correlated desktop -> extension -> desktop contract for "resolve this protected image token and report the result".

## Assumptions (temporary)

* For at least some protected image sites, the browser page context can still read or fetch the image bytes even when the desktop app cannot.
* Reusing the existing extension-to-desktop `save_data_url` contract is lower risk than inventing a brand-new native transfer protocol for image bytes.
* MVP can scope this fallback to browser-originated drags when the FlowSelect extension is installed and connected.
* Universal success for every protected site is not realistic because page CSP, CORS, canvas tainting, auth/session behavior, and blob-backed images vary by site.

## Open Questions

* None at the moment.

## Requirements (evolving)

* Preserve the current desktop direct-download path for normal public image URLs.
* Add a browser-context-assisted fallback for image drags that originate from a supported browser session with the FlowSelect extension available.
* Keep the fallback complementary to the current direct path, not a replacement for normal direct image downloads.
* MVP scope choice: trigger the browser-context path only after the desktop direct-download attempt fails with a hotlink-like rejection (`403`, `401`, HTML response, or similar origin rejection).
* MVP orchestration choice: keep the protected-image fallback synchronous from the desktop app's point of view, so one drag/drop operation still resolves to one immediate success/failure outcome.
* Reuse existing `save_data_url` backend persistence where practical.
* The final saved file must still land in FlowSelect's configured output directory (`outputPath`) rather than the browser's default download directory.
* Keep existing Pinterest drag enrichment and generic HTML image extraction behavior intact.
* Keep failures diagnosable in runtime evidence so support logs can distinguish:
  * direct backend image download failure
  * extension/browser-context fallback unavailable
  * extension/browser-context fallback attempted and succeeded/failed

## Acceptance Criteria (evolving)

* [ ] Dragging a protected image from a browser session with the extension installed can still save the image when the backend direct URL fetch is rejected by the origin site.
* [ ] When the browser-context fallback succeeds, the resulting file is saved into FlowSelect's configured output directory.
* [ ] Dragging a normal public image URL still uses the existing direct path without regression.
* [ ] Public/open browser image drags remain on the existing direct path during MVP unless that direct path fails.
* [ ] A protected-image fallback attempt still resolves within the original drop flow, with the user receiving an immediate success/failure result instead of a deferred later notification.
* [ ] When the browser-context fallback is unavailable, FlowSelect fails clearly and leaves diagnosable runtime breadcrumbs.
* [ ] Existing Pinterest image/video drag behavior remains intact.
* [ ] Existing local file drops and `data:` image saves remain intact.

## Definition of Done (team quality bar)

* Tests added or updated for the new fallback contract and runtime evidence
* Lint / typecheck / targeted Rust tests green
* PRD and task notes reflect the chosen approach and scope
* Runtime evidence clearly shows which path handled the image
* Unsupported / disconnected-extension cases fail safely

## Out of Scope (explicit)

* Solving every possible protected media site with a single universal bypass
* Replacing the current backend direct image path for all downloads
* Browser-first generic image-drag handling in MVP
* Full non-browser drag-source parity for apps such as chat tools or native clients
* Large-file transfer optimization beyond what is needed for MVP
* Silent cookie replay for arbitrary third-party sites without an explicit browser-context design

## Technical Approach

Recommended MVP:

Use an extension-assisted retry path for protected image drags.

1. Extension side:
   * Add a lightweight generic image-drag enrichment path for browser pages.
   * On `dragstart`, record enough transient context to recover the dragged image from the originating tab/page.
   * Embed a small FlowSelect-specific token/payload into `dataTransfer`, similar in spirit to the Pinterest drag payload, but without embedding full image bytes.
2. Desktop side:
   * Keep current direct image download attempt first for public/open images.
   * MVP scope choice: only if a dropped image carries an extension token and direct download fails with a hotlink-like failure (`403`, `401`, HTML response, origin rejection), trigger a browser-context resolution request instead of giving up.
   * MVP orchestration choice: the original drop flow remains open until the extension-assisted resolution finishes, so the outcome stays synchronous from the user's perspective.
3. Browser-context resolution:
   * Desktop backend sends a correlated fallback request to the extension.
   * Extension/background routes that request back to the originating tab/content script and waits for a correlated result.
   * Content script or page-context helper resolves the actual image bytes from the current page session.
   * MVP choice: extension sends those bytes to the desktop app through the existing `save_data_url` path, and the desktop app remains responsible for writing the final file into `outputPath`.
4. Diagnostics:
   * Runtime evidence logs direct-attempt failure, fallback request, fallback success/failure, and final save path.

## Cross-Layer Contract Sketch

### Drag token payload

Browser drag enrichment writes a lightweight FlowSelect token into drag data.

```json
{
  "kind": "protected_image",
  "token": "<opaque token id>",
  "pageUrl": "https://example.com/page",
  "imageUrl": "https://example.com/protected.jpg"
}
```

Rules:

* Token is opaque and short-lived.
* Token is advisory only; desktop still validates the dropped image URL and direct-failure shape before using it.
* Token must not include raw cookies or image bytes.

### Desktop -> extension fallback request

New WS action from desktop backend to extension:

```json
{
  "action": "resolve_protected_image",
  "data": {
    "requestId": "req_...",
    "token": "<opaque token id>",
    "imageUrl": "https://example.com/protected.jpg",
    "targetDir": "D:\\Downloads"
  }
}
```

Rules:

* `requestId` is required and is the correlation key for the synchronous MVP flow.
* `token` is required.
* `imageUrl` is optional-but-expected context for validation/logging and desktop-side fallback decisions.
* `targetDir` is optional; when omitted, backend `save_data_url` still resolves configured `outputPath`.

### Extension -> desktop fallback result

The extension satisfies the request by calling existing `save_data_url`, then replies to the waiting desktop request through the normal WS response envelope:

```json
{
  "success": true,
  "message": "D:\\Downloads\\image.png",
  "data": {
    "requestId": "req_..."
  }
}
```

Failure example:

```json
{
  "success": false,
  "message": "protected_image_resolution_failed",
  "data": {
    "requestId": "req_...",
    "code": "protected_image_resolution_failed"
  }
}
```

### Validation and error matrix

| Condition | Validation point | Expected behavior | Error code / note |
|-----------|------------------|-------------------|-------------------|
| Drop has no token | Frontend drop path | Stay on existing image flow | no protected fallback |
| Direct image fetch succeeds | Rust `download_image` | Do not call extension fallback | direct path wins |
| Direct image fetch fails with hotlink-like rejection | Frontend/backend fallback gate | Attempt synchronous extension fallback | runtime breadcrumb required |
| Extension disconnected / unavailable | Desktop fallback request | Fail clearly without hanging the drop flow | `not_connected` / similar |
| Token missing or expired | Extension background registry | Fail clearly | `protected_image_token_missing` |
| Content script cannot resolve bytes | Extension content/page helper | Fail clearly | `protected_image_resolution_failed` |
| `save_data_url` succeeds | Extension -> desktop save path | Return saved path and finish current drop successfully | success |
| `save_data_url` fails | Extension -> desktop save path | Return actionable failure | `save_data_url_failed` or mapped failure |

### Good / Base / Bad cases

* Good:
  * Protected drag from a browser page hits `download_image`, gets a hotlink-like rejection, then succeeds through `resolve_protected_image` and lands in `outputPath`.
* Base:
  * Public image drag still succeeds through direct `download_image` and never touches the new fallback path.
* Bad:
  * Desktop waits forever because the new desktop -> extension request is uncorrelated or the response omits `requestId`.

## Decision (ADR-lite)

**Context**: Backend/native replay of protected image URLs is insufficient for sites that enforce browser-context-only access. The app now has diagnostics proving extraction is working while the origin rejects the desktop fetch.

**Decision**: Prefer an extension-assisted browser-context fallback that reuses `save_data_url`, while keeping the existing desktop direct path for public image URLs.
Additionally, for MVP keep the fallback synchronous within the original drop operation rather than converting image drag handling into a deferred async completion flow.

**Consequences**:

* Pros:
  * Fits the current architecture better than inventing a new byte-transfer protocol
  * Targets the real failure mode: origin rejection of backend/native fetches
  * Keeps normal public-image downloads on the simpler existing path
  * Minimizes MVP scope by reusing an existing extension-to-desktop persistence path
  * Limits regression risk by avoiding a browser-first path for normal public images in MVP
* Cons:
  * Requires new cross-layer contracts between desktop app, background worker, and content/page scripts
  * Depends on the extension being installed, connected, and able to recover bytes from the source page
  * Some sites may still block browser-context byte extraction due to CSP/CORS/canvas tainting
  * `data:` payload size may still become a practical limit for very large images, so chunked transfer remains a future option if MVP hits size ceilings

## Research Notes

### Current repo constraints

* Desktop image handling lives in:
  * `src/App.tsx`
  * `src-tauri/src/lib.rs`
* Existing browser-extension transport pieces already exist:
  * `browser-extension/background.js`
  * `save_screenshot -> save_data_url`
* Existing drag enrichment precedent exists:
  * `browser-extension/pinterest-detector.js`
* Generic pages do not currently receive a FlowSelect image-specific content script.
* Extension manifest details:
  * `browser-extension/manifest.json` already grants `<all_urls>` host permissions
  * `content_scripts` are still limited to a fixed site list, so generic-page image enrichment is not active today
* Existing transport details:
  * `browser-extension/background.js` already maintains request IDs for extension -> desktop requests and desktop responses
  * desktop -> extension traffic is currently broadcast-style and uncorrelated, so protected-image fallback needs a new request/result contract because MVP now explicitly requires synchronous completion inside the original drop flow

### Feasible approaches here

**Approach A: Extension-assisted retry with transient drag token** (Recommended)

* How it works:
  * Browser drag writes a small FlowSelect image token into `dataTransfer`.
  * Desktop attempts normal direct download first.
  * On hotlink-like failure, desktop asks extension to resolve the token from the source tab/page and deliver bytes via `save_data_url`.
* Pros:
  * Small drag payload
  * Preserves current direct path for public images
  * Best match for the current failure mode
  * Keeps final file persistence inside the desktop app, so output-path semantics remain consistent
* Cons:
  * Needs new desktop -> extension request path and token registry

**Approach B: Browser-first image drag enrichment with embedded bytes**

* How it works:
  * Extension resolves image bytes before drop and embeds a `data:` URL directly into drag data.
  * Desktop saves via `save_data_url` immediately.
* Pros:
  * No post-drop desktop -> extension roundtrip
  * Desktop logic stays simple
* Cons:
  * Risky for large images due to drag payload size/memory overhead
  * Likely brittle across browsers and sites

**Approach C: Stronger backend replay (cookies/referer/header heuristics)**

* How it works:
  * Carry more browser session headers/cookies to the native image downloader.
* Pros:
  * Less extension/content-script work
* Cons:
  * Already shown to be insufficient for the Solar System Scope case
  * Security/privacy implications for generic third-party cookie replay
  * Still fails when the site requires true page/browser execution context

### MVP transport choice

* Chosen for MVP: reuse existing `save_data_url` for browser-context fallback persistence.
* Deferred for later: new chunked/binary desktop transfer path for large-image optimization.

### MVP scope choice

* Chosen for MVP: desktop direct image download remains first; browser-context fallback runs only after a hotlink-like direct failure.
* Deferred for later: browser-first generic image-drag handling.

### MVP helper delivery choice

* Chosen for MVP: add a lightweight generic image-drag content script on all pages covered by the extension host permissions.
* Deferred for later: on-demand injection or site-by-site narrowing if performance/privacy constraints require a narrower delivery model.

## Technical Notes

* Evidence captured on 2026-03-11:
  * direct request to `https://www.solarsystemscope.com/textures/download/2k_earth_nightmap.jpg`
  * result: `403 Forbidden`
  * content type: `text/html`
* Relevant files:
  * `src/App.tsx`
  * `src/utils/imageDrag.ts`
  * `src-tauri/src/lib.rs`
  * `browser-extension/background.js`
  * `browser-extension/pinterest-detector.js`
  * possible new generic image drag content script/helper under `browser-extension/`
* Existing persistence behavior:
  * `save_data_url` in the desktop backend already resolves `target_dir` / `outputPath` and writes files locally, so browser-assisted fallback can still land in the app-configured folder as long as bytes are routed back through the desktop app.
