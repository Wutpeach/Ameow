# Fix Xiaohongshu Drag Image/Video Regression

## Goal
Fix the Xiaohongshu drag regression where image-note drags unnecessarily open a background note tab and can poison subsequent video-note drags so they download only the cover image.

## Requirements
- Image-note drags with a direct embedded image hint should download the image directly without forcing Xiaohongshu drag-resolution background navigation.
- Extension-side Xiaohongshu drag resolution must treat a resolved image result as usable when the request is clearly image-oriented and there are no strong video signals.
- Existing video-note drag behavior must remain intact, including background/detail fallback when direct video URLs are not immediately available.
- Preserve high-confidence video-intent behavior so video notes that only expose cover media still stay on the video path.

## Acceptance Criteria
- [ ] Dragging a Xiaohongshu image note no longer opens a background tab when a direct embedded image URL is already available.
- [ ] After dragging an image note, dragging a video note in the same session still follows the video path instead of downloading only the cover image.
- [ ] Fresh-session video-note drag behavior remains unchanged.
- [ ] Regression coverage exists for the image-direct path and Xiaohongshu image/video signal helpers.

## Technical Notes
- This task spans renderer drag handling plus browser-extension Xiaohongshu drag resolution.
- Keep changes scoped to Xiaohongshu drag/image-video classification; do not change unrelated provider logic.
