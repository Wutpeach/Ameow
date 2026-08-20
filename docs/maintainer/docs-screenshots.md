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

## Environment Variables

The tool reads four `AMEOW_DOCS_SCREENSHOT_*` variables to control individual screenshot capture:

| Variable | Purpose |
| --- | --- |
| `AMEOW_DOCS_SCREENSHOT_TARGET` | Target screenshot ID to capture |
| `AMEOW_DOCS_SCREENSHOT_OUTPUT` | Output path for the capture |
| `AMEOW_DOCS_SCREENSHOT_DEVICE_SCALE_FACTOR` | Device pixel ratio (default: 4) |
| `AMEOW_DOCS_SCREENSHOT_USER_DATA` | User data directory path |

When these are not set, the tool runs all defined captures with defaults.

## Device Scale Factor

Both extension and desktop screenshots use a device scale factor of 4 (retina-quality captures):

- `extensionDeviceScaleFactor = 4`
- `desktopDeviceScaleFactor = 4`

## Output

Captures are written to `docs-screenshot-captures/` in the repository root. These are intermediate artifacts — the intended use is to select and place final screenshots into the docs site or README.

## Architecture Reference

The tool reuses the UI Lab event-driven scenario mechanism for desktop state captures. UI Lab is a DEV-only route pending retirement, but the screenshot tool's use of its IPC events (`dev_ui_lab_apply_scenario`) is independent of the route's lifecycle.

Source: `scripts/capture-docs-screenshots.mjs`, `electron/main.mts` (screenshot env vars).
