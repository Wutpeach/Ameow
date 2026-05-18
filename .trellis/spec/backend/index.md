# Backend Development Guidelines

> Best practices for backend development in FlowSelect.

---

## Overview

FlowSelect backend is built with Rust and Tauri v2. It handles file operations, video downloads, system integration, and WebSocket communication with browser extensions.

---

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Tauri | 2.x | Desktop framework |
| Tokio | 1.x | Async runtime |
| Reqwest | 0.11 | HTTP client |
| Serde | 1.x | Serialization |
| clipboard-win | 5.x | Clipboard access |
| regex | 1.x | Pattern matching |
| tokio-tungstenite | 0.21 | WebSocket server |

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | Done |
| [Type Safety](./type-safety.md) | Rust/Tauri command and event type contracts | Done |
| [Electron Runtime Contracts](./electron-runtime-contracts.md) | Tauri-to-Electron preload, window, extension transport, config, and packaging boundaries | Done |
| [Error Handling](./error-handling.md) | Result types, error propagation | Done |
| [Quality Guidelines](./quality-guidelines.md) | Code standards, forbidden patterns | Done |
| [Logging Guidelines](./logging-guidelines.md) | Log format, `>>>` prefix convention | Done |
| [Sidecar Runtime Contracts](./sidecar-runtime-contracts.md) | Cross-platform sidecar executable/resource contracts | Done |
| [Direct Download Onboarding Contracts](./direct-download-onboarding-contracts.md) | Cross-layer contract/template for adding new direct-download sites | Done |
| [Database Guidelines](./database-guidelines.md) | N/A - uses JSON config files | N/A |

---

## Tauri Plugins

- `tauri-plugin-opener` - File/URL opening
- `tauri-plugin-dialog` - File dialogs
- `tauri-plugin-autostart` - Startup configuration
- `tauri-plugin-global-shortcut` - Hotkey registration
- `tauri-plugin-shell` - Available plugin; Windows-sensitive managed downloader flows prefer native hidden CLI spawning

---

## Video Download Architecture

### Downloaders

| Downloader | Target Platforms | Implementation |
|------------|------------------|----------------|
| direct downloader | Xiaohongshu CDN URLs | Rust HTTP download |
| yt-dlp | YouTube, Twitter/X, Bilibili, and generic page URLs | Sidecar binary |

### Smart Routing

```
URL → Douyin → yt-dlp only (temporary validation strategy)
URL → Xiaohongshu direct candidate → direct download first → yt-dlp fallback
URL → other platforms → yt-dlp first
```

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

**Tauri Event Emission**:

```rust
// Use emit() for global events (frontend uses listen())
app.emit("video-download-complete", result);

// Don't use emit_to() unless targeting specific window with window.listen()
// app.emit_to("main", ...) may not work with global listen()
```

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
git add browser-extension/manifest.json package.json package-lock.json src/constants/appVersion.ts src-tauri/Cargo.toml src-tauri/tauri.conf.json
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
