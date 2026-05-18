# Unify Download Naming Rules

## Goal
Unify download naming behavior so video downloads prefer readable source titles, images keep simple collision-safe names, and the global rename toggle applies consistently across all resource types.

## Requirements
- Video downloads should prefer the cleaned request/page title as the source stem whenever a title is available.
- When title metadata is unavailable, video downloads may fall back to the existing URL-derived stem logic.
- Keep the yt-dlp visible filename style when rename is disabled:
  - `{title}[{width}x{height}][{quality}].{ext}`
- Align direct and gallery-dl video downloads with the same title-first stem selection.
- Image saves do not need title-based naming; keep simple original-name or inferred-name behavior with collision-safe suffixes.
- When `renameMediaOnDownload` is enabled, all resources should use the rename-rule path consistently, including videos, images, and browser-extension screenshot saves.
- Reduce special cases that bypass the global rename toggle.

## Acceptance Criteria
- [ ] Bilibili and other yt-dlp video downloads use title-first source naming when a title is present.
- [ ] Direct and gallery-dl video downloads use the same title-first source stem behavior when rename is disabled.
- [ ] Image downloads continue to avoid collisions with suffixes such as `_2`, `_3`.
- [ ] Enabling `renameMediaOnDownload` forces all supported resource saves to use the rename strategy rather than source-title or trace-id naming.
- [ ] Existing tests cover the new naming behavior and pass.

## Technical Notes
- This change spans extension payloads, Electron runtime video engines, and Electron main-process image save flows.
- Keep backward compatibility for legacy config keys where possible, but treat `renameMediaOnDownload` as the canonical toggle.
