# Directory Structure

> How backend code is organized in FlowSelect.

---

## Overview

The backend is a single-file Rust application with all logic in `lib.rs`. External binaries (yt-dlp) are bundled in the `binaries/` directory.

---

## Directory Layout

```
src-tauri/
├── src/
│   ├── lib.rs             # Core backend logic (~1600 lines)
│   └── main.rs            # Entry point (minimal)
│
├── binaries/              # Bundled executables
│   └── yt-dlp-x86_64-pc-windows-msvc.exe
│
├── capabilities/          # Tauri v2 permissions
│   └── default.json       # Capability declarations
│
├── icons/                 # App icons
│
├── Cargo.toml             # Rust dependencies
├── tauri.conf.json        # Tauri configuration
└── build.rs               # Build script
```

---

## Module Organization

All backend code lives in `lib.rs`, organized by functionality:

1. **Imports & State** (lines 1-50)
2. **File Operations** (lines 50-160)
3. **Image Processing** (lines 160-310)
4. **AE Integration** (lines 310-390)
5. **Video Download** (lines 390-700)
6. **Config Management** (lines 700-800)
7. **System Integration** (lines 800-1000)
8. **WebSocket Server** (lines 1000-1400)
9. **App Setup** (lines 1400-1600)

---

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Functions | snake_case | `get_clipboard_files` |
| Structs | PascalCase | `DownloadProgress` |
| Constants | SCREAMING_SNAKE | `DOWNLOAD_CHILD` |
| Commands | snake_case | `#[tauri::command]` |

---

## Examples

**Well-structured command**: `src-tauri/src/lib.rs:119-158`
- Clear function signature
- Proper error handling with Result
- Logging with `>>>` prefix
