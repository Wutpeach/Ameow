# Backend Development Guidelines

> Best practices for backend development in FlowSelect.

---

## Overview

FlowSelect desktop runtime is Electron-first. It handles file operations, video downloads, system integration, and WebSocket communication with browser extensions through Electron main-process code plus shared TypeScript runtime modules.

---

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Electron | 41.x | Desktop framework |
| Node.js runtime | current toolchain | Main-process runtime |
| TypeScript | 5.8.3 | Shared runtime typing |
| ws | 8.20.0 | WebSocket server/client |
| zod | 4.3.6 | Runtime validation |

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | Done |
| [Type Safety](./type-safety.md) | Desktop command and event type contracts | Done |
| [Electron Runtime Contracts](./electron-runtime-contracts.md) | Preload, window, extension transport, config, and packaging boundaries | Done |
| [Error Handling](./error-handling.md) | Result types, error propagation | Done |
| [Quality Guidelines](./quality-guidelines.md) | Code standards, forbidden patterns | Done |
| [Logging Guidelines](./logging-guidelines.md) | Log format, `>>>` prefix convention | Done |
| [Sidecar Runtime Contracts](./sidecar-runtime-contracts.md) | Cross-platform sidecar executable/resource contracts | Done |
| [Direct Download Onboarding Contracts](./direct-download-onboarding-contracts.md) | Cross-layer contract/template for adding new direct-download sites | Done |
| [Database Guidelines](./database-guidelines.md) | N/A - uses JSON config files | N/A |

---

## Runtime Boundaries

- `electron/` owns app lifecycle, windowing, tray, autostart, updater, dialogs, loopback extension transport, and desktop command bridging.
- `src/electron-runtime/` owns framework-light downloader/runtime logic.
- `src/desktop/runtime.ts` is the renderer-facing bridge wrapper.
- Historical Tauri/Rust references in older docs or archived tasks should be treated as migration background unless the same file explicitly says they are still current.

---

## Video Download Architecture

### Downloaders

| Downloader | Target Platforms | Implementation |
|------------|------------------|----------------|
| gallery-dl | Pinterest, Weibo primary, and gallery-dl-supported sites | Managed Python sidecar |
| yt-dlp | YouTube, Twitter/X, Bilibili, and generic page URLs | Sidecar binary |
| douyin-dl | Douyin page URLs | Managed Python sidecar |

### Smart Routing

```
URL → Douyin → yt-dlp only (temporary validation strategy)
URL → Xiaohongshu canonical note URL → yt-dlp only
URL → Pinterest → gallery-dl only
URL → other platforms → yt-dlp first
```

`direct` is no longer a backend engine id. Media candidate labels such as `direct_mp4` or `direct_cdn` may still describe browser-discovered hints, but site providers must route those requests to an active sidecar backend.

### Cookies Flow (High Quality Video)

Downloader cookies should come from Settings > Site login state. The browser extension must not attach cookies to generic video download payloads.

```
Settings site login capture
    ↓ <userDataDir>/site-sessions/<siteId>.json
Electron buildExecutionContext()
    ↓ intent.cookies = stored Netscape cookie string
yt-dlp / gallery-dl / douyin-dl cookie-file or config path
```

Browser-extension cookie reads are reserved for request-level page/media resolution flows such as Xiaohongshu drag resolution and protected-image fetching.

**Electron Event Emission**:

- Desktop-originated renderer events must preserve current event names such as `video-download-progress`, `video-download-complete`, and `video-queue-count`.
- Renderer code should consume those events through `window.ameow.events.on(...)` via `src/desktop/runtime.ts`.

**Progress Bar Lifecycle**:
- Always emit `video-download-complete` event on ALL code paths (success, error, cancel)
- Missing complete event = progress bar stuck forever

---

## Release Process

The repository has GitHub Actions configured for automated releases.

### Creating a Release

**Push a tag to trigger automatic build:**

```bash
# 1. Update version with:
#    npm run version:set -- X.Y.Z
#    Then ensure `release-notes/vX.Y.Z.md` exists and is filled (see `.trellis/spec/guides/release-prep-guide.md`).

# 2. Commit version bump
git add browser-extension/manifest.json package.json package-lock.json src/constants/appVersion.ts
git commit -m "chore: bump version to X.Y.Z"

# 3. Push commit
git push origin main

# 4. Create and push tag (triggers GitHub Actions)
git tag vX.Y.Z
git push origin vX.Y.Z
```

> **Note**: Only push the tag. GitHub Actions will automatically build and create the release.

---

**Language**: All documentation should be written in **English**.
