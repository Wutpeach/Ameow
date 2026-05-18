# Main-Window Clipboard Image Paste Support

## Goal

Allow the focused FlowSelect main window to accept an image that exists only in the system clipboard, such as a screenshot from a snipping tool, and save it directly into the configured output folder through the existing FlowSelect receive pipeline.

## Requirements

* Support explicit paste into the focused main window only.
* Clipboard image paste must work on both Windows and macOS.
* Clipboard image paste must reuse the existing save pipeline so output-path resolution, rename behavior, and AE integration stay consistent.
* Existing paste flows for video URLs, image URLs, data URLs, and clipboard file lists must continue to work.
* The implementation should prefer a small number of high-value clipboard image paths that cover real-world screenshot tool differences without expanding into custom OS-specific readers.
* Failure cases must produce an observable log path instead of silently doing nothing.

## Acceptance Criteria

* [x] Pasting a screenshot image into the focused main window creates a media file in the configured output folder via the existing `save_data_url` path when the clipboard exposes either a paste-event image payload or a plugin-readable native clipboard image.
* [x] Existing rename rules still apply to pasted clipboard images because the save path is unchanged.
* [x] Existing paste flows for URLs and clipboard file lists remain functional.
* [x] Failure cases now log clipboard-image read/save failures instead of silently no-oping.

## Definition of Done

* [x] Relevant frontend/backend/cross-layer specs reviewed before editing
* [x] Lint passes
* [x] Typecheck passes
* [x] Rust compile check passes
* [x] Existing automated tests pass
* [x] PRD updated with final decision and technical approach

## Technical Approach

The final implementation keeps the current `paste` action as the trigger, but no longer trusts a single clipboard format. It now checks the most useful clipboard image sources in order and reuses the existing save pipeline for all successful paths.

Actual flow:

* `src/App.tsx` keeps the existing text-based paste branches for video URLs, image URLs, and data URLs.
* A window-level `paste` listener is registered so clipboard handling is not limited to a single React element target.
* If the paste event exposes an image `File`/Blob directly through `clipboardData.files` or `clipboardData.items`, FlowSelect serializes that file to a data URL and saves it with `originalFilename` when available.
* If the paste event exposes only pasted HTML that contains an image/data URL, FlowSelect resolves that image and saves/downloads it.
* If the paste event does not expose a usable image payload, the frontend falls back to `readImage()` from `@tauri-apps/plugin-clipboard-manager`.
* The plugin-returned clipboard image is converted from RGBA bytes into a PNG data URL using a canvas.
* If no clipboard image is available through those paths, FlowSelect falls through to the existing clipboard file-list path.

## Decision (ADR-lite)

**Context**: The feature needed to be stable and not Windows-only. Real-world testing showed different screenshot tools expose different clipboard formats, so a single image-read path was not sufficient.

**Decision**: Use a compact hybrid strategy for explicit paste handling:
* keep existing text URL handling
* prefer image payloads exposed directly on the paste event
* fall back to the official Tauri clipboard plugin for native clipboard image reads
* keep the existing clipboard file-list behavior as the final non-image fallback

**Consequences**:

* Pros:
  * Better compatibility across different screenshot tools on Windows and macOS
  * Minimal behavioral change to the existing save pipeline
  * Lower maintenance than custom OS-specific clipboard readers
* Trade-off:
  * Slightly more frontend clipboard-branching logic than the earlier single-path version

## Out of Scope

* Global clipboard monitoring outside an explicit paste action
* Redesigning the save pipeline, rename system, or AE integration
* Adding a new UI surface specifically for clipboard-image status

## Technical Notes

Changed files:

* `src/App.tsx`
* `src-tauri/src/lib.rs`
* `src-tauri/capabilities/default.json`
* `package.json`
* `package-lock.json`
* `src-tauri/Cargo.toml`
* `src-tauri/Cargo.lock`

Implementation details:

* Added `@tauri-apps/plugin-clipboard-manager` on the frontend and `tauri-plugin-clipboard-manager` on the Rust side.
* Registered `.plugin(tauri_plugin_clipboard_manager::init())` in the Tauri builder.
* Added `clipboard-manager:allow-read-image` to the desktop capability.
* Clipboard image encoding uses a canvas to turn plugin RGBA bytes into a PNG data URL before calling `save_data_url`.
* Direct paste-event image files use their original filename when available, which improves non-rename naming behavior for tools that expose a file-like screenshot payload.

Verification run:

* `npm run typecheck`
* `npm run lint`
* `cargo check`
* `npm test`

Research references:

* Tauri clipboard plugin docs
* Tauri clipboard plugin crate docs
* MDN `ClipboardEvent.clipboardData`
