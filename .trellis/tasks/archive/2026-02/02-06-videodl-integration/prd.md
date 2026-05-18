# videodl Integration PRD

## Overview

Integrate videodl as a supplementary downloader for Chinese video platforms in FlowSelect.

## Goals

- Support Chinese video platforms (Bilibili, Douyin, Kuaishou, Xiaohongshu, etc.)
- Smart routing: China platforms → videodl first, International → yt-dlp first
- Fallback mechanism between downloaders
- **Package videodl as sidecar for distribution**

## Architecture

```
URL Input → Platform Detection → Smart Dispatcher → Progress Events
                                      ↓
                          videodl ⟷ yt-dlp (fallback)
```

---

## Phase 1: Core Integration ✅ COMPLETED

### Completed

- [x] Python HTTP server (`D:\videodl\http_server.py`)
- [x] Rust backend integration (process management, SSE consumer)
- [x] Frontend URL pattern detection
- [x] Settings UI (enable toggle, Python path, status indicator)
- [x] Progress bar display and close on complete
- [x] SSE real-time streaming (janus async queue)
- [x] Downloader label display (yt-dlp / videodl)

### Bugs Fixed

| Bug | Root Cause | Fix |
|-----|------------|-----|
| Progress bar not closing | `emit_to()` vs `emit()` | Use `emit()` for global events |
| SSE data buffered | `queue.Queue.get()` blocks event loop | Use `janus.Queue` for async/sync |
| Error path no complete event | Missing emit on error | Add emit on all error paths |

---

## Phase 2: Packaging & Distribution ✅ COMPLETED

### Goal

Package videodl as a sidecar exe so users don't need Python installed.

### Tasks

- [x] **2.1** PyInstaller packaging
  - Create `videodl/build.py` script
  - Test `pyinstaller --onefile http_server.py`
  - Verify exe runs standalone (71.9 MB)

- [x] **2.2** Tauri sidecar integration
  - Add `videodl-server` to `tauri.conf.json` externalBin
  - Modify Rust code to launch sidecar instead of external process
  - Handle sidecar lifecycle (start/stop/restart)

- [x] **2.3** GitHub Actions workflow
  - Add Python setup step
  - Clone videodl repo and build exe
  - Include in final bundle

- [ ] **2.4** Update mechanism (optional, deferred)
  - Add `/version` endpoint to videodl
  - Check for updates on startup
  - Download and replace exe

### Files to Modify

| File | Change |
|------|--------|
| `D:\videodl\http_server.py` | Add `/version` endpoint |
| `src-tauri/tauri.conf.json` | Add videodl-server to externalBin |
| `src-tauri/src/lib.rs` | Change to sidecar launch |
| `.github/workflows/release.yml` | Add videodl build steps |

---

## Testing Checklist

### Phase 1 ✅
- [x] Parse Douyin URL
- [x] Download Douyin video
- [x] Progress bar shows and closes
- [x] Error handling works

### Phase 2 ✅
- [x] videodl-server.exe runs standalone
- [x] FlowSelect launches sidecar correctly
- [ ] GitHub Actions builds successfully (pending first release)
- [ ] MSI installer includes videodl (pending first release)
