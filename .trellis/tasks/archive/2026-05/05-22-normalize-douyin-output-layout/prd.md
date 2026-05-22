# Normalize Douyin downloader output layout

## Goal

Make Ameow's Douyin backend produce the same user-facing output shape as the other downloaders: the final media file should appear directly in the selected target folder, without an extra author subfolder or a visible `download_manifest.jsonl` sidecar file.

## Requirements

- Scope is limited to the Ameow integration around managed `douyin-dl` execution.
- Preserve the current upstream `douyin-dl` package and runtime strategy; do not fork or patch the installed Python package.
- Continue using upstream `download_manifest.jsonl` internally if it is needed to identify the downloaded media artifact.
- After a successful Douyin download, return a `file_path` that points to the final media artifact in the requested output directory root.
- If upstream writes the media inside an author folder, move or flatten the selected result artifact into the requested output directory root.
- Avoid overwriting existing user files. If the flattened target filename already exists, choose a deterministic non-conflicting filename.
- Remove the `download_manifest.jsonl` sidecar from the user-visible output directory after Ameow has consumed it.
- After flattening, remove empty folders that were created only by this Douyin download when safe to do so.
- Do not delete non-empty folders or unrelated user files.
- Keep support for existing Douyin result detection based on manifest records and filesystem artifacts.
- Keep the script and runtime smoke paths safe for Unicode filenames and Windows paths.

## Acceptance Criteria

- [x] A successful Douyin backend download leaves the final media file directly under the requested output directory root.
- [x] A successful Douyin backend download does not leave `download_manifest.jsonl` in the requested output directory root.
- [x] Empty upstream-created author folders are removed after flattening.
- [x] Existing files in the requested output directory are not overwritten during flattening.
- [x] Unit tests cover manifest cleanup, flattening from a nested author directory, and filename collision handling.
- [x] Focused Douyin runtime tests pass.
- [x] `npm run type-check`, `npm run lint`, and `npm test` pass.

## Notes

- Upstream `douyin-downloader` exposes `folderstyle`, but local installed code shows `folderstyle: false` only disables per-work subfolders; the author directory is still created by `FileManager.get_save_path(...)`.
- Upstream `metadata_handler.append_download_manifest(...)` writes `download_manifest.jsonl` to the configured base path, and no local evidence currently shows a config flag to disable it.
- Therefore the desired behavior should be implemented as an Ameow post-processing step after `douyin-dl` finishes.
