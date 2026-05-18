# Investigate YouTube transcode regression and Bilibili parity

## Goal
Find why highest-quality YouTube downloads are now completing as MKV without entering the intended transcode flow, fix the regression, and verify whether Bilibili is affected by the same pipeline issue.

## Requirements
- Identify the regression point in the current download-to-transcode pipeline.
- Preserve the intended contract where source download completion and downstream transcode queueing are separate stages.
- Ensure highest-quality YouTube downloads enqueue transcode when the downloaded source is not AE-safe / target-safe.
- Verify whether Bilibili highest-quality downloads follow the same path and fix parity issues if present.
- Keep queue/event payloads and completion semantics aligned with existing frontend/backend contracts.

## Acceptance Criteria
- [ ] Highest-quality YouTube downloads no longer stop at a raw MKV completion when transcode is required.
- [ ] The backend emits source download completion before downstream transcode work for affected downloads.
- [ ] Bilibili is checked against the same code path, with any parity bug fixed or explicitly ruled out.
- [ ] Lint/type-check/tests relevant to the changed code pass.

## Technical Notes
- This is a cross-layer debugging task involving yt-dlp orchestration, output normalization, download completion semantics, and transcode queue scheduling.
- Use literal search fallback because `ace-tool` is not available in this environment.
