# Add quality suffix to non-rename yt-dlp outputs

## Goal
Allow repeated downloads of the same video under different quality presets to produce separate output files when rename mode is disabled.

## Requirements
- Update the non-rename yt-dlp output naming strategy so different quality presets do not collide on the same filename.
- Preserve existing rename-enabled behavior.
- Keep this task separate from the Windows console-window fix.

## Acceptance Criteria
- [ ] Re-downloading the same video with different quality presets can produce separate files in the output directory.
- [ ] Rename-enabled downloads keep the current naming behavior.
- [ ] The naming format decision is documented before implementation.

## Technical Notes
Use a non-rename yt-dlp output template of the form `<title>[<width>x<height>][<quality>].<ext>` for full-video downloads so repeated downloads under different presets do not collide while same-preset downloads still reuse the same target path.
