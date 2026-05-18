# Fix highest quality transcode fallback for bilibili preview

## Goal
Prevent the "highest quality" download path from forcing an unnecessary transcode when the actual downloaded bilibili stream is only preview-grade 1080P and can already be downloaded directly as MP4.

## Requirements
- Reproduce and identify the condition that marks a highest-quality bilibili download for transcoding.
- Ensure the decision is based on the effective downloaded format/capability instead of the requested "highest quality" intent alone.
- Preserve existing transcoding behavior for cases that truly require post-processing.

## Acceptance Criteria
- [ ] A bilibili highest-quality request that falls back to preview 1080P does not enter the transcode flow when the download output is already a direct MP4-compatible format.
- [ ] Downloads that still need remux/transcode continue to follow the existing processing pipeline.
- [ ] Lint and typecheck pass after the fix.

## Technical Notes
This likely touches the cross-layer quality-selection contract between the frontend quality option, downloader metadata, and backend post-download processing decision.
