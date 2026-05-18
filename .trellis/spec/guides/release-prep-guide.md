# Release Prep Guide

This guide captures the project release-prep workflow so it is repeatable across sessions and agents.

## Goal

When the user asks to bump the app version to `X.Y.Z`, complete the release-prep work in a single, consistent flow:

- Update the app version using the repository-standard script entry point.
- Ensure a versioned release note exists for the target version.
- Fill the release note with user-facing changes (not a raw commit dump).

## Non-Negotiables

- Do not manually edit version strings across the repo.
- Always use `npm run version:set -- <version>` for version bumps.
- Browser extension `manifest.version` must stay Chromium-valid: 1 to 4 dot-separated integer segments only. If the app uses prerelease metadata, keep the full semver in `version_name` instead.
- Release notes must live in `release-notes/v<version>.md` and be present in the tagged commit.
- Release notes must be written in Chinese by default.
- Tagged GitHub Releases must include `Ameow_<version>_browser_extension.zip` as a browser-extension asset.
- Keep a `Full Changelog` compare line at the bottom of the release note.

## Standard Flow (When User Says "Update Version To X.Y.Z")

1. Run `npm run version:set -- X.Y.Z`.
2. Confirm `release-notes/vX.Y.Z.md` exists.
3. Fill `release-notes/vX.Y.Z.md`:
   - Use the current repo style (see recent `release-notes/v*.md`).
   - Write the content in Chinese unless the user explicitly asks for another language.
   - Keep `Highlights`, `Fixes`, and `Notes` sections only if they are non-empty.
   - Prefer plain language summaries of user-facing behavior changes.
4. Set `Full Changelog` compare targets:
   - Prefer `v<previous-tag>...vX.Y.Z` if tags exist.
   - If intermediate tags are missing in this repo, document the compare-range choice in `Notes` (as done in recent releases).
5. Confirm the browser-extension release asset contract still holds:
   - Local packaging entrypoint: `npm run package:browser-extension`
   - Published release asset: `Ameow_X.Y.Z_browser_extension.zip`

## Source Material For Writing

When drafting release notes, gather change candidates from:

- Commits since the previous version bump commit.
- If that is unavailable, commits since the most recent `v*` tag.
- Any completed Trellis tasks related to the release window.

## Commit Policy

- Do not create commits unless the user explicitly asks.
- When committing a release-prep change, keep it atomic:
  - Version bump files plus the new `release-notes/vX.Y.Z.md` file.
  - Avoid mixing unrelated task-tracking or workspace files into the release commit.
