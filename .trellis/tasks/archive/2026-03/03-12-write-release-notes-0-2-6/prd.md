# Write Release Notes For 0.2.6

## Goal
Create `release-notes/v0.2.6.md` with concise user-facing release notes for version `0.2.6`.

## Requirements
- Follow the structure and authoring rules in `release-notes/README.md`.
- Use `release-notes/TEMPLATE.md` and existing release notes as the writing pattern.
- Summarize the main user-visible changes that landed after `v0.2.5.md` was authored.
- Keep the note focused on user impact instead of raw commit subjects.
- Include a `Full Changelog` compare link at the bottom.
- Explain the missing intermediate `v0.2.3`, `v0.2.4`, and `v0.2.5` tags if the compare link still has to start from `v0.2.2`.

## Acceptance Criteria
- [x] `release-notes/v0.2.6.md` exists.
- [x] The note contains accurate `Highlights`, `Fixes`, and `Notes` sections, or removes any empty section.
- [x] The wording matches the style used by recent release notes in this repository.
- [x] The bottom compare link is present and uses the correct tag range for the current repository state.

## Technical Notes
- Relevant feature/fix sources include:
  - main-window output folder double-click shortcut
  - transcode queue UI in the desktop window
  - extension popup removal of the AE format toggle
  - download quality selection and AE-safe probing regression fixes
