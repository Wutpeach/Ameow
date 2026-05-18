# Fix close-hide behavior and portable video download diagnostics

## Goal
Fix the main window close interaction and make portable-package video download failures diagnosable and recoverable.

## Requirements
- Main panel top-right close button must hide the main window directly instead of entering icon mode.
- Keep existing idle minimize/icon-mode behavior for inactivity and drag interactions unchanged.
- Improve yt-dlp runtime resolution so portable packaging layouts can still run video download.
- When download fails, surface meaningful failure details in frontend UI and console output.
- Ensure Windows portable packaging includes binary layout expected by runtime fallback paths.

## Acceptance Criteria
- [ ] Clicking the top-right close button hides the main window immediately.
- [ ] Auto-minimize to icon mode still works after idle timeout.
- [ ] Video download in portable package can locate and execute yt-dlp.
- [ ] Failed download shows an actionable error message instead of only an X indicator.
- [ ] Lint/typecheck pass for modified frontend and backend code.

## Technical Notes
- Cross-layer flow touched: browser extension -> WS message -> Rust download dispatcher -> frontend completion UI.
- Add sidecar command fallback to explicit binary path candidates (resource dir, executable dir, binaries dir).
- Keep logging format with `>>>` prefix in Rust logs.
