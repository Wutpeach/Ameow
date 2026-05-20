# browser extension boundary refactor

## Architecture

The browser extension becomes a browser-only capture and transport layer.

It keeps:
- injected/current-page media detection
- pasted-link browser-assisted selection when page context is required
- image page/drag resolution that depends on tab context, page bridges, or browser cookies
- popup UI and preference sync transport
- WebSocket message transport to the desktop app

It drops:
- short-link expansion
- extension-side URL canonicalization beyond basic request validation
- any download routing or engine selection logic
- any attempt to pre-resolve URLs that the backend/downloader can already handle

The backend remains the owner of:
- site/provider matching
- engine fallback order
- queueing and execution
- raw URL handling for short links and redirects
- persisted download preference application

## Boundary

### Browser extension keeps

- DOM and page-bridge work that only a browser tab can do.
- Injected button workflows that need current-page media discovery.
- Pasted-link fallback workflows that need to open or inspect a real browser page before forwarding a selection.
- Image flows that need authenticated browser context or page-derived data.
- Quality preference sync transport.

### Backend keeps

- `SiteRegistry.resolve(...)` provider selection.
- provider-specific engine fallback.
- `queue_video_download` and runtime execution.
- short-link handling by downloader behavior, not by pre-expansion in extension/runtime.

### Remove or deprecate

- `browser-extension/short-link-resolution.js`
- `resolveVideoSelectionShortLinks(...)` in `browser-extension/background.js`
- any extension-side URL rewriting that exists only to improve downloader routing
- any remaining runtime-owned short-link pre-expansion if still present

## Data Flow

### Injected video

1. Content script detects a video or media element.
2. Background forwards the raw page context and media hints.
3. Backend resolves provider and engine from the raw payload.
4. Backend executes the download.

### Pasted link

1. Desktop app receives a pasted URL.
2. Backend decides whether browser-assisted resolution is worth trying based on site/provider rules.
3. If needed, extension resolves page-context-only fields.
4. Extension forwards raw selection data without short-link expansion.
5. Backend resolves provider/engine and executes.

### Image

1. Extension resolves page-derived or authenticated image data when browser context is required.
2. Extension forwards the minimal payload needed for saving.
3. Backend performs the actual save/download work.

## Cookies Policy

- Cookies are an on-demand fallback, not a permanently enabled extension responsibility.
- Default downloads should not fetch browser cookies.
- Generic video download cookies should come from backend-owned site login state, not from extension payloads.
- Browser-extension cookie reads stay reserved for request-level browser/media resolution flows such as protected image fetching, drag resolution, or other browser-context fallbacks.
- A future backend-owned cookie retry flow may be added only after it is reconciled with the existing site-login-state contract.
- Do not add a blanket "fetch cookies for every site" behavior.

## Xiaohongshu Policy

- Xiaohongshu video should be backend-first.
- If `yt-dlp` can resolve the video URL directly, the extension should not be involved in the video path.
- Remove Xiaohongshu from the generic pasted-video extension-assisted site set unless a specific browser-only fallback is still needed for a known broken case.
- The extension may remain only as a fallback for the cases that truly require browser-only page state, such as token recovery or special right-click / drag context.
- Xiaohongshu image flows remain in the extension because they still depend on page-derived image extraction and browser-context resolution.
- Keep the XHS image path separate from the XHS video path; do not force one policy onto both.

## Compatibility Notes

- Do not remove provider routing. The repository already depends on site-specific fallback plans, including multi-engine behavior.
- Do not introduce a new fixed downloader per URL. The existing model is provider-first, not downloader-first.
- Do not add a second URL-normalization layer in the extension. Keep only validation that is required to reject obviously invalid input.

## Risks

- Short links that relied on browser-side pre-expansion may now depend entirely on downloader redirect behavior.
- Some browser-assisted pasted flows may return less metadata if the extension stops rewriting URLs.
- Image flows can regress if the page-context boundary is trimmed too aggressively.
- Cookies behavior can conflict with the existing site-login-state contract if generic video downloads start accepting extension cookies again.
- Xiaohongshu video fallback must not become the default path again once backend `yt-dlp` succeeds reliably.
- The pasted-video assisted site set must stay aligned with the backend-first policy so XHS does not keep routing through the extension by accident.

## External Review

Claude reviewed this boundary and found no must-fix issues. The review agreed that:

- extension-side short-link expansion can be removed cleanly because the deleted module was only imported by `browser-extension/background.js`
- `shortLinkExpansions` was not consumed downstream, so removing the field is safe
- `src/core/short-links.ts` remains valid as input acceptance only, not as expansion logic
- Xiaohongshu pasted video should route directly to the backend queue while Xiaohongshu image flows remain separate and browser-context-owned

The review recommended one follow-up smoke-test focus: real short links such as `b23.tv`, `v.douyin.com`, or `t.cn` should be manually checked after the change because they now reach downloader engines as raw short URLs. If a specific short-link host fails, the fix should be backend provider/downloader support rather than restoring browser-extension pre-expansion.
