# Switch downloader binaries to official upstream releases

## Goal
Replace FlowSelect's self-built downloader binary supply chain with official upstream release binaries, and finish the related runtime/UI hardening work needed so Pinterest downloads, cancellation, and main-window task transitions behave reliably in the shipped app.

## Requirements
- Use official upstream release binaries for both `gallery-dl` and `yt-dlp` instead of local `pip`/`PyInstaller` builds.
- Keep the app runtime contract stable by preserving current internal binary names and runtime path expectations where possible.
- Make local dev, renderer build, Electron build, and packaging flows fail early when required downloader binaries are missing.
- Remove the current self-build `gallery-dl` pipeline and replace it with an official-download ensure/smoke flow.
- Align `yt-dlp` and `gallery-dl` bootstrap scripts so both downloaders use one consistent supply-chain approach.
- Keep Settings/runtime status surfaces accurate after the migration, including downloader version/source information and official release links/update actions.
- Preserve Pinterest routing on `gallery-dl`; do not add `yt-dlp` as a Pinterest fallback to mask `gallery-dl` runtime issues.
- Fix active download cancellation so cancelling from the main window actually aborts the running downloader process and settles UI state.
- Ensure the main window restore/minimize lifecycle is stable for both download and transcode states:
- Foreground task startup must not crop task UI inside compact native bounds.
- Task completion/cancellation must return the window to the expected icon-mode behavior when appropriate.
- The window must remain draggable after task completion.
- Update tests/specs/docs that define downloader runtime contracts.

## Acceptance Criteria
- [ ] FlowSelect no longer depends on `scripts/build-gallery-dl-binary.mjs` or any local `gallery-dl` `PyInstaller` build step.
- [ ] `desktop-assets/binaries/` receives official upstream downloader binaries through repo scripts, with stable file names matching runtime expectations.
- [ ] `npm run dev`, `npm run electron:dev`, `npm run build`, and packaging entry points ensure required downloader binaries before launch/package.
- [ ] Runtime dependency inspection resolves bundled `yt-dlp` and `gallery-dl` from the official-downloaded artifacts without changing renderer/runtime command contracts.
- [ ] Settings shows valid version/source info for bundled `gallery-dl` and `yt-dlp` after the migration.
- [ ] Cancelling an active video download aborts the underlying task and emits terminal settlement instead of letting the file finish downloading.
- [ ] Starting a download from compact/icon mode restores the main window without clipped 80x80 content.
- [ ] The same no-crop restore contract holds for transcode-related foreground task UI.
- [ ] After download completion/cancellation, the main window can return to icon mode and still drag normally.
- [ ] Automated checks pass for the touched chain (`lint`, `type-check`, relevant tests).
- [ ] Manual smoke: the bundled official `gallery-dl` can handle the known Pinterest repro URL that fails under the previous self-built binary.

## Technical Notes
- Keep Pinterest on the maintained `gallery-dl` path; the migration fixes the runtime supply chain rather than routing around it.
- Prefer one shared downloader script family for official release download, smoke verification, and target resolution across both tools.
- Preserve existing binary naming conventions such as `gallery-dl-x86_64-pc-windows-msvc.exe` and `yt-dlp-x86_64-pc-windows-msvc.exe` so runtime path code stays simple.
- Use stronger smoke validation than file existence alone, but keep automated checks deterministic and lightweight.
- Treat this as a cross-layer task touching scripts, Electron main/runtime, renderer task-state handling, settings UI, tests, and specs.
