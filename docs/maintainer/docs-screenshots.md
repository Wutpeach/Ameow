# Documentation Screenshots

Maintainer runbook for the documentation screenshot capture tool.

## Overview

The docs screenshot tool (`scripts/capture-docs-screenshots.mjs`) captures screenshots for documentation use. It handles two capture modes:

1. **Browser extension screenshots**: Uses Playwright + Chromium to capture extension popup and launcher states.
2. **Desktop state screenshots**: Uses Electron + UI Lab event-driven scenarios to capture desktop window states.

## Prerequisites

```bash
npx playwright install chromium
```

Chromium must be installed for Playwright-based extension screenshots.

## Running

```bash
npm run docs:screenshots
```

The tool:

1. Starts a static file server for the browser extension
2. Launches Chromium via Playwright to capture extension UI states (popup, launcher)
3. Launches Electron with UI Lab scenario injection to capture desktop window states
4. Outputs captures to `docs-screenshot-captures/`

## Internal Environment Protocol

`AMEOW_DOCS_SCREENSHOT_*` variables are an internal protocol between this orchestration script and the Electron child process it spawns. The script sets them per-capture; they are not user-facing configuration, and there is no CLI flag for selecting individual captures. The tool always runs all defined captures.

| Variable | Purpose |
| --- | --- |
| `AMEOW_DOCS_SCREENSHOT_TARGET` | Target screenshot ID (set by the script per capture) |
| `AMEOW_DOCS_SCREENSHOT_OUTPUT` | Output path (set by the script per capture) |
| `AMEOW_DOCS_SCREENSHOT_DEVICE_SCALE_FACTOR` | Device pixel ratio (script sets 4; main-process fallback 3) |
| `AMEOW_DOCS_SCREENSHOT_USER_DATA` | Temporary user-data directory (set by the script per capture) |

## Device Scale Factor

Both extension and desktop screenshots use a device scale factor of 4 (retina-quality captures):

- `extensionDeviceScaleFactor = 4`
- `desktopDeviceScaleFactor = 4`

## Output

Captures are written to `docs-screenshot-captures/` in the repository root. These are intermediate artifacts — the intended use is to select and place final screenshots into the docs site or README.

## Architecture Reference

The current screenshot flow uses the UI Lab scenario mechanism (`dev_ui_lab_apply_scenario`) for specific desktop state captures — `desktop-download-active` and `desktop-transcode-active`. These targets invoke `applyDocsScreenshotUiLabScenario()` in `electron/main.mts`, which calls `window.ameow.commands.invoke("dev_ui_lab_apply_scenario", ...)` on the renderer. Other targets (settings pages, main-window-expanded) use direct window capture or settings-window navigation instead.

UI Lab is a DEV-only route pending retirement. When UI Lab retirement lands, this screenshot workflow must be re-verified and updated — the scenario mechanism depends on the UI Lab command system being available in the renderer.

Source: `scripts/capture-docs-screenshots.mjs`, `electron/main.mts` (`applyDocsScreenshotUiLabScenario`, `resolveDocsScreenshotUiLabScenario`, screenshot env vars).
