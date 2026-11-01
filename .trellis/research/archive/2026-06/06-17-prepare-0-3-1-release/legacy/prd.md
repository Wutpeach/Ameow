# Prepare 0.3.1 release

## Goal

Prepare the repository for the `0.3.1` app release by updating all version sources through the project version script and adding Chinese release notes that summarize user-facing changes since `v0.3.0`.

## Confirmed Facts

- Current app version in `package.json` is `0.3.0`.
- Project convention requires version bumps to use `npm run version:set -- <version>` rather than manual multi-file edits.
- In this Electron repository shape, `scripts/update-version.mjs` updates:
  - `package.json`
  - `package-lock.json`
  - `browser-extension/manifest.json`
  - `src/constants/appVersion.ts`
- Tagged releases require `release-notes/v<version>.md` to exist in the tagged commit.
- Release notes should use `release-notes/TEMPLATE.md` as the starting point and be written in Chinese by default.
- `release-notes/v0.3.0.md` exists, so `v0.3.1.md` should compare `v0.3.0...v0.3.1`.
- The public docs site has manually maintained release-note pages:
  - `site/src/content/docs/docs/releases/index.md` for Chinese.
  - `site/src/content/docs/en/docs/releases/index.md` for English.
- The docs-site release pages currently include `v0.3.0` as the newest stable release, so `v0.3.1` should be added there too.
- `scripts/update-version.mjs` updates `browser-extension/manifest.json` through `applyAppVersionToExtensionManifest(...)`; for stable `0.3.1`, `manifest.version` should become `0.3.1` and no `version_name` is needed.
- Notable user-facing changes since `v0.3.0` include:
  - Main/floating window motion and compact expansion refinements.
  - Browser extension launcher and tooltip visual fixes.
  - Scheduled site-session cookie refresh.
  - Douyin download routing changes to prefer `yt-dlp`, modal/share-source handling, auth recovery, and documentation updates.
  - Compatible HEVC transcode outputs skipping unnecessary processing.
  - Advanced quality dismiss toast suppression.
  - Single-download queue badge fix.
  - Dependency security alert fixes.

## Requirements

- Run `npm run version:set -- 0.3.1` as the single version update entry point.
- Add `release-notes/v0.3.1.md` in Chinese using the existing release-note structure.
- Add `v0.3.1` entries to both docs-site release pages, matching the page language and existing stable-release structure.
- The release note should summarize user-facing changes in plain language, not dump commit subjects.
- Keep a `Full Changelog` compare link at the bottom: `https://github.com/Wutpeach/Ameow/compare/v0.3.0...v0.3.1`.
- Ensure browser-extension version metadata is updated by the version script, not by manual manifest-only edits.
- Do not create or push the `v0.3.1` git tag in this task unless explicitly requested later.
- Validate that version files were updated consistently by the script and that the release-note file exists.

## Acceptance Criteria

- [x] `package.json` reports version `0.3.1`.
- [x] Other script-managed version files are updated to `0.3.1`.
- [x] `browser-extension/manifest.json` reports Chromium-valid version `0.3.1`.
- [x] `release-notes/v0.3.1.md` exists and is written in Chinese.
- [x] `site/src/content/docs/docs/releases/index.md` includes a Chinese `v0.3.1` stable-release entry.
- [x] `site/src/content/docs/en/docs/releases/index.md` includes an English `v0.3.1` stable-release entry.
- [x] The release note has a `Full Changelog` link comparing `v0.3.0...v0.3.1`.
- [x] Validation commands pass or any skipped checks are explicitly documented.

## Out Of Scope

- Creating the `v0.3.1` tag.
- Pushing release commits or tags.
- Changing release workflow configuration.

## Open Questions

- None. The requested target version and release-note language are covered by project conventions.

## Notes

- This is a lightweight release-prep task. PRD-only planning is sufficient before implementation.
