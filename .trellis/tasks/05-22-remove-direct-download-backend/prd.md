# Remove direct download backend path

## Goal

Remove the `direct` video download backend from runtime planning so manual link downloads no longer dispatch through the direct media fetch path. Pinterest should use `gallery-dl` as its sole download backend, with no direct-first plan and no fallback configured.

## Requirements

- Inspect all runtime paths that can produce a `direct` engine plan and identify whether any provider other than Pinterest can still route to `direct`.
- Update Pinterest planning so it always prefers `gallery-dl` as the only backend.
- Remove any Pinterest-specific direct media candidate handling that only existed to select the direct backend.
- Keep the gallery-dl Pinterest source URL based on the page/source URL used today.
- Update focused tests so direct is no longer expected for Pinterest and no active provider emits direct plans.
- Remove unreachable `direct` backend code paths when no runtime provider uses them, including the engine implementation, core engine id/schema entries, probe support, and tests that only cover the removed backend.
- Preserve media candidate vocabulary such as `direct_mp4` because those values describe discovered media hints, not a download backend.
- Do not change unrelated backend behavior for yt-dlp, gallery-dl, or douyin-dl.

## Acceptance Criteria

- [x] Repository search confirms no site provider still emits a `direct` engine plan after the change.
- [x] Pinterest resolved plans contain only `gallery-dl`.
- [x] Pinterest direct asset URLs do not create a direct-first plan.
- [x] Focused unit tests for provider strategy/planning pass.
- [x] The `direct` engine is not registered in the runtime engine registry.
- [x] Core engine plan and capability schemas no longer accept `direct` as a backend engine id.
- [x] Capability probe tooling no longer has a direct HEAD/Range probe path.
- [x] Tests that remain use only active backend engines (`yt-dlp`, `gallery-dl`, `douyin-dl`) while retaining media candidate `direct_*` values where relevant.

## Notes

- User explicitly asked to remove the direct download backend path and make Pinterest gallery-dl first/only without fallback.
- This is a lightweight, PRD-only task.
