# browser extension boundary refactor

## Goal

Clarify and shrink the browser extension's responsibility boundary so the backend owns download execution and most routing logic, while the extension only keeps browser-only context collection and transport duties.

## Requirements

- Keep browser-only capabilities in the extension when they require DOM access, tab creation, page bridges, or authenticated browser context.
- Move pure URL/download-routing behavior out of the extension when the backend can resolve it from raw URLs and persisted config.
- Keep backend site/provider routing, but avoid keeping extra browser-side URL normalization unless it is required for browser-only extraction.
- Remove browser-side short-link expansion and reduce URL handling to the minimum required for validation and browser-only extraction.
- Preserve current video download behavior for injected media, pasted links, and image flows during the refactor.
- Keep quality preference synced as configuration, but do not make the extension the source of truth for download execution.
- Remove or deprecate redundant extension logic where the backend already owns the same responsibility.

## Acceptance Criteria

- [ ] The extension responsibility split is documented with a clear keep/move/deprecate boundary.
- [ ] Pasted-link handling is classified as either a browser-only fallback path or a backend-owned path with explicit justification.
- [ ] Short-link expansion and site-hint logic have an explicit owner.
- [ ] URL normalization is either removed or reduced to only the minimum needed for backend safety.
- [ ] The extension no longer performs short-link expansion before queueing downloads.
- [ ] Dynamic video-element detection remains only where it is required for injected/current-page media selection.
- [ ] Image-download extension behavior is limited to browser-only extraction or authenticated page context, not duplicate download execution.
- [ ] The refactor plan identifies the highest regression risks and the tests needed to guard them.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
- Confirmed facts from the repo:
  - `queue_video_download` is the backend queue entry point.
  - `queue_pasted_video_download` currently tries extension-assisted selection first, then falls back to the plain queue path.
  - The extension still handles quality sync, short-link expansion, injected video selection forwarding, and some image flows.
  - Browser-only features such as DOM inspection, tab creation, and page-bridge messaging cannot be moved wholesale to the backend.
  - Backend already has site/provider resolution via `SiteRegistry.resolve(...)` and per-site engine plans.
  - The current direction is to keep provider routing in backend, but drop browser-side short-link expansion and most URL rewriting.
