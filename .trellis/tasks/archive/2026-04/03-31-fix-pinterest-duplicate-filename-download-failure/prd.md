# Fix Pinterest Duplicate Filename Download Failure

## Goal
Prevent Pinterest video downloads from failing when multiple downloads resolve to the same display name such as `Pin 图卡片`.

## Requirements
- Detect when the resolved download target filename already exists before treating the gallery-dl run as failed.
- Preserve successful downloads for repeated Pinterest videos without requiring the user to manually delete the prior file.
- Keep the existing Pinterest download flow and output naming behavior compatible with the current UI.

## Acceptance Criteria
- [ ] Downloading a first Pinterest video still succeeds.
- [ ] Downloading a second Pinterest video that resolves to the same base title also succeeds.
- [ ] The runtime no longer reports `gallery-dl finished without producing an output file` for this duplicate-name case.

## Technical Notes
- Likely affects the desktop download pipeline that shells out to `gallery-dl` for Pinterest URLs.
- The fix may require reconciling gallery-dl output naming with post-download rename/move logic on Windows.
