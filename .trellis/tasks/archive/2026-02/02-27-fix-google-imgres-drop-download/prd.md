# Fix Google imgres Drag Image Download

## Goal
Make image drag-drop downloads from Google Images reliable by eliminating async-runtime panic and resolving Google `imgres` redirect URLs to original image URLs.

## Requirements
- Replace blocking HTTP call inside `download_image` async Tauri command with async reqwest client flow.
- Add URL normalization so Google `imgres` URLs use `imgurl` query param as the effective download URL.
- Keep existing output directory, sequence naming, and AE portal behavior unchanged.
- Preserve project-standard error handling and logging style.

## Acceptance Criteria
- [ ] Dragging Google image entries that provide `https://www.google.com/imgres?...&imgurl=...` no longer triggers Tokio runtime drop panic.
- [ ] `download_image` performs network requests using async reqwest APIs (`send().await`, `bytes().await`).
- [ ] If `imgurl` exists and is valid http/https URL, backend downloads from that URL instead of the Google wrapper URL.
- [ ] Existing non-Google image URL and data URL flows continue to work.

## Technical Notes
- Keep changes scoped to backend image download path.
- Follow backend quality guideline: no blocking operations in async functions.
