# Update GitHub README Project Overview

## Goal
Rewrite the repository README so it accurately explains what FlowSelect does today, how to run it, and which user-facing capabilities are currently implemented.

## Requirements
- Replace outdated or incomplete project descriptions with current behavior from the React UI and Rust backend.
- Document the main product surfaces: floating main window, settings window, and context menu.
- Document the current media workflow, including drag/paste capture, video download queueing, browser extension integration, and optional After Effects import.
- Keep installation and development commands aligned with `package.json` and Tauri config.
- Provide a Chinese default GitHub README and an English alternative, with clear links between them.
- Add GitHub-friendly showcase content for preview visuals, platform-specific download entry points, and browser-extension installation guidance.

## Acceptance Criteria
- [ ] `README.md` reflects current capabilities present in `src/App.tsx`, `src/pages/SettingsPage.tsx`, and `src-tauri/src/lib.rs`.
- [ ] `README.md` is the Chinese default page and links to an English version.
- [ ] `README.en.md` provides an English equivalent and links back to the Chinese version.
- [ ] Both READMEs include a preview/showcase section suitable for the GitHub repository homepage.
- [ ] Both READMEs include per-platform download guidance for release artifacts.
- [ ] Both READMEs include a visual browser-extension installation guide.
- [ ] Installation and development commands match the current repo scripts and Tauri setup.
- [ ] The README no longer relies on stale feature lists or outdated platform support claims.
- [ ] The updated content is readable as a GitHub landing page for new users and contributors.

## Technical Notes
- The current README output shows encoding issues in the terminal, so treat the existing file as untrusted and replace it with a clean UTF-8/ASCII-friendly rewrite.
- Keep claims scoped to behavior verified locally from source and config files.
