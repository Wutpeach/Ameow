# Refactor drag and file intake handling

## Goal

Refactor Ameow's main-window drag and file intake handling so local file-system drops, folder drops, clipboard files, browser/chat-app payloads, and URL/media drops have explicit, testable semantics.

The main user value is predictable file placement: users should understand when Ameow moves a real local file into the output folder, when it copies/saves external data, and when dropping a folder changes the output folder.

## Confirmed Facts

- The main drop handler currently lives in `src/App.tsx` and handles many unrelated cases in one large function: folder drops, local file paths from preload, `DataTransfer.files`, `file://` URLs, site-specific URL/media drops, image downloads, video queueing, and fallbacks.
- Electron preload can access real local file paths through `webUtils.getPathForFile(...)`; the renderer cannot reliably use DOM `File.path`.
- `process_files` is shared by multiple intake paths:
  - local file-system drag/drop
  - clipboard files
  - `file://` URL handling
  - legacy renderer `File.path` fallbacks
- The desired current product semantics are:
  - dragging real local files from the file system into the main window should move them into the output folder;
  - dropping a folder should change the output folder;
  - data supplied by browser/chat apps, clipboard, or blob/file payload fallback should be copied/saved rather than treated as a source file to remove.
- Product decision: `file://` drops that are not captured by preload as native file-system drops are copy/save inputs, not move-capable local file drops.
- Product decision: when rename-on-download/intake is enabled, the rename rule has highest priority for all output-folder collection workflows, including downloads and local file drag-move. Moving changes how the source is consumed, not how the destination name is chosen.
- The current code has duplication and risk:
  - local path handling is spread across preload paths, `file://` paths, and renderer `File.path` fallbacks;
  - `process_files` results are parsed via English strings such as `"Copied 0 files"`;
  - move mode can rename a file already inside the output folder instead of treating it as already placed;
  - single-path and multi-path DataTransfer parsing overlap in `electron/preloadDrop.mts`.

## Requirements

- Preserve existing supported drop workflows:
  - drag real local files into the main window;
  - drag a folder into the main window to set the output folder;
  - paste files from the Windows clipboard;
  - drag browser/chat-app image/video/file payloads where Electron cannot or should not remove the source;
  - drag URLs and supported site-specific media payloads.
- Make operation semantics explicit:
  - local file-system drag/drop uses move semantics;
  - clipboard and external app/browser data paths use copy/save semantics;
  - `file://` fallback paths use copy/save semantics unless preload has already classified the drop as native local files;
  - folder drops never copy/move folder contents and only update the output folder.
- Remove or quarantine redundant renderer-side local path fallbacks that can cause a local file drop to silently copy instead of move.
- Keep local file path extraction inside Electron preload / bridge boundaries, not through direct renderer assumptions about `File.path`.
- Replace user-flow decisions based on string result parsing with a structured result or equivalent typed signal.
- Preserve preload drop capture-phase ordering so native path facts are available before React drop handling consumes them.
- Handle move edge cases safely:
  - same output location should not rename or delete unexpectedly;
  - cross-volume moves may use copy + delete internally but must preserve move semantics;
  - failures should not delete sources unless the destination write succeeded.
- Define mixed native drops explicitly. If a drop contains a folder and files, folder selection takes priority unless implementation evidence shows a safer explicit rejection/error state is needed.
- Keep rename-rule behavior compatible and authoritative for all output-folder collection workflows, including local-file move workflows.
- Update public docs if user-facing behavior or wording changes.

## Acceptance Criteria

- [ ] Dragging one or more real local files from the file system into the main window moves them into the active output folder.
- [ ] Dragging a real local file that is already in the active output folder does not create a duplicate renamed copy or accidentally delete the file.
- [ ] Dragging a folder into the main window still changes the active output folder and does not copy/move folder contents.
- [ ] Clipboard file paste still copies files into the active output folder and leaves the originals intact.
- [ ] Browser/chat-app blob/file payload fallbacks still save a copy into the output folder and do not assume source deletion is possible.
- [ ] When rename rules are enabled, downloaded files, copied/saved files, and moved local files all use the configured rename rule for destination naming.
- [ ] URL, image, video, Pinterest, and Xiaohongshu drop flows continue to route through their existing media handling paths.
- [ ] `process_files` callers no longer need to parse `"Copied 0 files"` / `"Moved 0 files"` strings to make control-flow decisions.
- [ ] Partial success/failure in multi-file processing is represented without string parsing, with enough detail to avoid accidental fallback processing of already-handled files.
- [ ] Relevant unit tests cover local path extraction, move vs copy behavior, same-output move behavior, and blob fallback behavior where practical.
- [ ] `npm run type-check`, `npm run lint`, `npm test`, `npm run docs:build` when docs change, and `git diff --check` pass.

## Notes

- This is a complex cross-layer refactor. It should have `design.md` and `implement.md` before implementation starts.
- Existing uncommitted work at task creation includes the immediate move-semantics fix and docs wording update; the refactor task should treat that as current working context, not silently revert it.

## Open Questions

- None currently.
