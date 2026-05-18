# Package Browser Extension In Local And GitHub Release Flows

## Goal
Ensure FlowSelect release packaging always includes a distributable browser-extension archive, both for local packaging workflows and for GitHub Releases.

## Requirements
- Add a repository-owned packaging entrypoint for the browser extension that works from the current working tree.
- The packaging entrypoint must produce a deterministic ZIP artifact for the `browser-extension/` directory.
- The ZIP artifact name must include the app/release version so it can ship alongside desktop artifacts.
- The packaged ZIP must contain a top-level `browser-extension/` directory so users can extract it and load it as an unpacked Chromium extension.
- The local packaging flow must expose the browser-extension packaging as an npm script and include it in the release-oriented local packaging path.
- The GitHub release workflow must attach the browser-extension ZIP to the draft/published GitHub Release.
- Documentation must mention how to generate and find the packaged browser-extension artifact locally.

## Acceptance Criteria
- [ ] Running the local browser-extension packaging command creates a versioned ZIP containing the current `browser-extension/` files under a top-level `browser-extension/` folder.
- [ ] Running the Windows local portable packaging flow also produces the browser-extension ZIP without requiring a separate manual step.
- [ ] The GitHub release workflow creates or stages the browser-extension ZIP and publishes it as a release asset.
- [ ] The workflow fails fast with a clear error if the browser-extension source directory or manifest file is missing.
- [ ] README documentation describes the local packaging command and the presence of the browser-extension release asset.

## Technical Notes
- Development type: `fullstack` because this spans npm scripts, local packaging scripts, CI workflow, and release/documentation contracts.
- Target code-spec to update if needed: `.trellis/spec/guides/release-prep-guide.md` so future release prep remembers the browser-extension asset.
- Proposed packaging contract:
  - Command: `node ./scripts/package-browser-extension.mjs [--version <version>] [--output-dir <dir>]`
  - NPM entrypoint: `npm run package:browser-extension`
  - Default output name: `FlowSelect_<version>_browser_extension.zip`
  - ZIP root layout: `browser-extension/...`
- Validation and error matrix:
  - Missing `browser-extension/` or `browser-extension/manifest.json`: fail with explicit error.
  - Existing output ZIP: overwrite deterministically.
  - Local packaging flow succeeds but extension ZIP is absent: treat as packaging failure.
- Good/Base/Bad cases:
  - Good: local package flow emits desktop artifact plus the versioned extension ZIP; GitHub Release contains the same ZIP.
  - Base: standalone `npm run package:browser-extension` succeeds even without running desktop build commands.
  - Bad: release publishes desktop binaries but omits the browser-extension ZIP, or ZIP contents are flattened without the `browser-extension/` root folder.
