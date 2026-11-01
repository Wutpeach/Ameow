# Add Extension Default Direct-Download Quality Preference

## Goal
Add a browser-extension setting that lets users choose the default quality preference for direct downloads, and apply that preference to Douyin/Xiaohongshu candidate selection without breaking the existing desktop download flow.

## Requirements
- Add a persistent quality preference control in the browser extension popup.
- Keep the default behavior aligned with the current "best available" expectation.
- Persist the preference inside the extension so it survives popup close/reopen.
- Apply the preference before forwarding `video_selected` to the desktop app.
- Limit the behavior change to Douyin and Xiaohongshu direct-download flows.
- Preserve backward compatibility of the existing `video_selected` payload.

## Acceptance Criteria
- [ ] Popup shows a default quality selector and saves the selected option.
- [ ] Reopening the popup restores the saved quality preference.
- [ ] Background worker reorders/filter candidates for Douyin/Xiaohongshu based on the saved preference.
- [ ] Existing downloads still work when no preference has been saved yet.
- [ ] Current direct-download quality-selection behavior is documented for the user.

## Technical Notes
- Use `chrome.storage.local` for extension-only persistence.
- Do not require Rust-side config/schema changes.
- Current direct-download routing only tries the first two direct candidates, so preference must be applied before the payload reaches the desktop app.
- Because current detectors do not expose explicit resolution metadata, the first implementation should use safe, explainable URL heuristics and preserve fallback behavior.
