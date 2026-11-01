# Fix Weibo Drag Misclassified As Local Folder

## Goal
Prevent browser-originated Weibo image/video drags from being misclassified as local folder drops before the normal URL and HTML drag handlers run.

## Requirements
- Keep real local folder drops working for output-path selection.
- Treat file-like browser drags without a resolvable local filesystem path as normal web drags.
- Avoid surfacing the local-folder error state for unresolved browser drags.
- Preserve existing behavior where non-directory local file paths fall through to normal file or URL handling.

## Acceptance Criteria
- [ ] Dragging a real local folder still updates the output path.
- [ ] Dragging a browser media item that exposes `Files` or `kind === "file"` but has no resolvable local path no longer produces the local-folder error.
- [ ] Unresolved browser drags continue into the renderer's existing URL/HTML/image/video detection flow.
- [ ] Focused automated tests cover the preload-side fallback behavior.

## Technical Notes
- Prefer a source-side fix in `electron/preload.mts` so the renderer does not receive a false folder-drop failure for browser drags.
- Keep the renderer-side `NOT_DIRECTORY` fallback semantics unchanged.
