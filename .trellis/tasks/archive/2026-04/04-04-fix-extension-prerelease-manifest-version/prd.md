# Fix Browser Extension Prerelease Manifest Version

## Goal
Ensure browser-extension packages remain installable in Chromium browsers when the desktop app uses prerelease semantic versions such as `0.3.0-rc1` or `0.4.0-beta.8`.

## Requirements
- Preserve the existing app version flow driven by `npm run version:set -- <version>`.
- Derive a Chromium-compatible numeric `manifest.version` from prerelease app versions.
- Keep prerelease information available in the extension metadata so build artifacts remain identifiable.
- Make browser-extension packaging fail fast if the staged manifest is invalid for Chromium.

## Acceptance Criteria
- [ ] Running the version update flow with a prerelease version does not leave an invalid `browser-extension/manifest.json`.
- [ ] Packaged browser-extension ZIPs contain a manifest with a Chrome-valid numeric `version`.
- [ ] Prerelease labels remain represented in extension metadata without breaking installation.
- [ ] Focused verification covers stable and prerelease version cases.

## Technical Notes
- Chromium extension versions allow only 1 to 4 dot-separated integer segments.
- `version_name` can carry user-facing prerelease labels while `version` remains numeric.
- The fix should stay within the existing release and packaging script flow.
