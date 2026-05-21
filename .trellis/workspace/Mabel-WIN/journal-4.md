# Journal - Mabel-WIN (Part 4)

> Continuation from `journal-3.md` (archived at ~2000 lines)
> Started: 2026-04-08

---



## Session 141: Browser extension generic media trigger and Xiaohongshu right-click hardening

**Date**: 2026-04-08
**Task**: Browser extension generic media trigger and Xiaohongshu right-click hardening
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Generic trigger layer | Added context-menu and popup-driven generic media selection entrypoints for the browser extension, plus shared generic video candidate utilities and detector coverage. |
| Xiaohongshu routing | Reworked Xiaohongshu right-click/media resolution to prefer canonical note URLs, route image-only targets to `save_image`, and avoid leaking feed/profile titles into output naming. |
| Trigger reliability | Broadened context-menu contexts, added Xiaohongshu context-menu guard, retained detail-page injected controls where they still provide value, and removed download-only Pinterest detail injection. |
| Verification | Ran `npm run locales:sync`, `npm run lint`, `npm run type-check`, `npm test`, targeted `vitest` suites, manifest JSON validation, and `node --check` on updated extension scripts. |

**Commits**
- `ffd6ec0` `fix(extension): stabilize generic media triggers`
- `9862ca7` `chore(extension): normalize xiaohongshu debug logging`

**Key files**
- `browser-extension/background.js`
- `browser-extension/manifest.json`
- `browser-extension/generic-video-detector.js`
- `browser-extension/generic-video-selection-utils.js`
- `browser-extension/xiaohongshu-contextmenu-guard.js`
- `browser-extension/xiaohongshu-detector.js`
- `browser-extension/popup.js`
- `.trellis/spec/backend/electron-runtime-contracts.md`


### Git Commits

| Hash | Message |
|------|---------|
| `ffd6ec0` | (see git log) |
| `9862ca7` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 142: Restore X and Bilibili injected controls

**Date**: 2026-04-08
**Task**: Restore X and Bilibili injected controls
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| X injected controls | Restored the Twitter/X content-script registration in `browser-extension/manifest.json` so the site-specific injected download button is available again. |
| Bilibili injected controls | Restored the four injected Bilibili control-bar buttons and hardened detector recovery so controls can be reattached after native player rerenders while keeping native-style alignment. |
| Global context menu | Preserved the existing context-menu download flow as a site-agnostic fallback without changing background routing behavior. |
| Verification | Ran `npm run lint`, `npm run type-check`, and `npm run test` before commit; browser-extension Vitest coverage was extended for manifest registration and Bilibili control-container fallback detection. |

**Updated Files**:
- `browser-extension/manifest.json`
- `browser-extension/twitter-detector.js`
- `browser-extension/bilibili-detector.js`
- `browser-extension/manifest.test.js`
- `browser-extension/bilibili-detector.test.js`


### Git Commits

| Hash | Message |
|------|---------|
| `63139eb` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 143: Xiaohongshu drag video fallback fix

**Date**: 2026-04-09
**Task**: Xiaohongshu drag video fallback fix
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Xiaohongshu drag video | Fixed waterfall/profile-page video drag fallback so tokenized note detail URLs and hidden detail probing can resolve real video downloads instead of falling back to cover images. |
| Extension bridge | Added a Xiaohongshu page-world bridge at document_start to capture `noteId -> detailUrl/xsecToken/xsecSource` from feed/search/user responses and persist that cache for later drag resolution. |
| Cross-layer contract | Updated local `.trellis/spec/` guidance and synced tracked markdown templates under `src/templates/markdown/spec/` so the trust order between weak drag hints and canonical note hints is documented. |
| Validation | Human verified the download fix, then `npm run type-check`, `npm run lint`, and `npm test` all passed before commit. |

**Commits**:
- `18e916e` `fix(xiaohongshu): resolve tokenized drag detail fallback`
- `0adf254` `docs(spec): capture xiaohongshu drag fallback lessons`

**Key Files**:
- `browser-extension/xiaohongshu-page-bridge.js`
- `browser-extension/xiaohongshu-contextmenu-guard.js`
- `browser-extension/xiaohongshu-detector.js`
- `browser-extension/background.js`
- `electron/main.mts`
- `src/App.tsx`
- `src/electron-runtime/xiaohongshuPageHints.ts`
- `src/utils/xiaohongshu.ts`
- `src/templates/markdown/spec/backend/electron-runtime-contracts.md`
- `src/templates/markdown/spec/frontend/type-safety.md`
- `src/templates/markdown/spec/guides/cross-layer-thinking-guide.md`


### Git Commits

| Hash | Message |
|------|---------|
| `18e916e` | (see git log) |
| `0adf254` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 144: 收敛扩展下载入口并修复小红书拖拽回归

**Date**: 2026-04-09
**Task**: 收敛扩展下载入口并修复小红书拖拽回归
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

| Feature | Description |
|---------|-------------|
| 扩展入口收敛 | 移除了浏览器扩展上的“下载当前视频”按钮，保留拖拽、粘贴链接、右键菜单等主要下载入口，避免重复能力带来的维护成本。 |
| 小红书拖拽修复 | 修复小红书图片拖拽误开后台页、图片/视频连续拖拽后错误落到视频封面，以及视频帖子解析回退链不稳定的问题。 |
| 跨层稳固 | 在扩展侧强化图片/视频信号判断，在 Electron 侧补充页面提示与受保护媒体回退策略，避免把 bare CDN 根地址当成有效图片。 |

**Validation**:
- `npm run lint`
- `npm run type-check`
- `npm test`

**Commits**:
- `79c0a05` `refactor(extension): remove popup current-video action`
- `ae30f2b` `fix(xiaohongshu): harden drag media resolution`


### Git Commits

| Hash | Message |
|------|---------|
| `79c0a05` | (see git log) |
| `ae30f2b` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 145: Weibo short-link expansion and Electron dev restart

**Date**: 2026-04-09
**Task**: Weibo short-link expansion and Electron dev restart
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

## Summary
- Added generic short-link expansion for browser-extension, renderer paste entry, and Electron runtime before provider routing.
- Added Electron hidden-navigation fallback for fetch-resistant short links so Weibo `t.cn` -> `passport.weibo.com/visitor/...` can resolve to final `weibo.com/tv/show/...` URLs.
- Kept Weibo canonical detail/status URLs on `gallery-dl`, while routing `weibo.com/tv/show/...` to `yt-dlp` only after wrapper expansion.
- Updated `npm run dev` harness to auto-restart the Electron main process after successful `tsc --watch` rebuilds.
- Restored dragged Weibo/Sina image downloads by recognizing `sinaimg.cn` as image URLs and forwarding page context for referer-sensitive image fetches.

## Validation
- `npm run lint`
- `npm run type-check`
- `npm test`
- Targeted short-link/provider/image tests for Electron runtime and drag parsing all passed.

## Notes
- Updated local `.trellis/spec/` guidance for Electron short-link expansion and dev main-process restart behavior; `.trellis/` is gitignored so those spec edits remain local workspace knowledge.


### Git Commits

| Hash | Message |
|------|---------|
| `6b8ed45` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 146: Weibo drag image high-quality upgrade MVP

**Date**: 2026-04-09
**Task**: Weibo drag image high-quality upgrade MVP
**Branch**: `main`

### Summary

Implemented a conservative image-quality upgrade pipeline for generic image drags, with deterministic Weibo URL upgrades, a filtered image-max-url adapter, and safe fallback to the original URL.

### Main Changes

| Area | Description |
|------|-------------|
| Weibo drag upgrade | Added deterministic `sinaimg.cn` bucket upgrades so dragged Weibo thumbnails can resolve to higher-quality image URLs before download. |
| Generic image path | Added a shared `upgradeImageUrl(...)` step in the generic image drop flow so ordinary HTTP image drags can try a safe high-resolution upgrade before `download_image`. |
| maxurl adapter | Integrated `image-max-url` behind a thin adapter with conservative filtering: same-host only, no videos, no possibly-different or likely-broken candidates. |
| Safety | Kept protected-image, Xiaohongshu, and Pinterest special-case flows unchanged; ordinary image downloads fall back to the original URL if no safe upgrade exists. |
| Verification | Added unit tests for Weibo upgrades and maxurl fallback behavior; passed targeted vitest, `npm run type-check`, `npm run lint`, and `npm run build:renderer`. |

**Updated Files**:
- `src/App.tsx`
- `src/utils/imageQualityUpgrade.ts`
- `src/utils/imageQualityUpgrade.test.ts`
- `src/utils/maxurlAdapter.ts`
- `src/utils/weiboImageUpgrade.ts`
- `src/types/image-max-url.d.ts`
- `package.json`
- `package-lock.json`


### Git Commits

| Hash | Message |
|------|---------|
| `014b59c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 147: 修复 X 图片拖拽下载

**Date**: 2026-04-09
**Task**: 修复 X 图片拖拽下载
**Branch**: `main`

### Summary

修复 X/Twitter 图片拖拽下载链路：将 /status/.../photo/<n> 拖拽优先路由到图片分支并规范化为 tweet 页面上下文；为 pbs.twimg.com 图片链接增加 name=orig 质量升级；强化 Electron 受保护图片下载的多层抓取回退；主窗口在前台图片下载期间显示加载态，完成后再短暂显示结果。用户已完成手测，确认 X 图片可下载且可见加载态。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `46c756268f4e2f2257da18f932f6776767f2a9ef` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 148: 推送 X 图片下载修复到远程

**Date**: 2026-04-09
**Task**: 推送 X 图片下载修复到远程
**Branch**: `main`

### Summary

将已完成、已手测通过的 X/Twitter 图片拖拽下载修复提交 46c7562 推送到 origin/main。该提交包含 X /photo/<n> 拖拽走图片分支、tweet 页面上下文规范化、pbs.twimg.com 图片 name=orig 质量升级、Electron 图片抓取回退增强，以及前台下载加载态显示。远程分支 main 已更新。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `46c756268f4e2f2257da18f932f6776767f2a9ef` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 149: Repair Windows dev environment and add global proxy setting

**Date**: 2026-05-18
**Task**: Repair Windows dev environment and add global proxy setting
**Branch**: `main`

### Summary

Restored npm run dev on the Windows machine by completing the broken Electron install, documented the Windows process-cleanup gotcha, and added a global desktop proxy URL setting that applies through Electron's default session for bootstrap and other desktop fetches.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `7d7cbec` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 150: Investigate Windows bootstart pinned lookup 403

**Date**: 2026-05-18
**Task**: Investigate Windows bootstart pinned lookup 403
**Branch**: `main`

### Summary

Replaced GitHub release metadata lookup with pinned direct download URLs for yt-dlp and gallery-dl, fixed the gallery-dl tag to the official 2026.03.30 asset, and verified tests/lint/type-check.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `465e82f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 151: Douyin managed downloader and session flow

**Date**: 2026-05-18
**Task**: Douyin managed downloader and session flow
**Branch**: `main`

### Summary

Integrated douyin-downloader as a managed runtime, routed Douyin downloads to the dedicated backend, and added app-owned Playwright session capture plus settings management.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `1018479` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 152: Settings site login session badges

**Date**: 2026-05-18
**Task**: Settings site login session badges
**Branch**: `main`

### Summary

Compact settings login-state UI into a future multi-site badge pattern.

### Main Changes

- Reworked the Settings downloads login section into a compact future-facing site login states area.
- Added a Douyin badge model with semantic ready, warning, danger, and muted status dots.
- Made the Douyin badge the primary login/refresh trigger while preserving runtime retry, confirmation, cancellation, and clear-session auxiliary actions.
- Added missing Douyin session locale keys and synced generated browser-extension locale resources.
- Consulted Claude Code for a second-opinion review and kept partial / awaiting-confirmation states explicit instead of hiding them behind the badge.
- Validation: npm run locales:sync, npm run type-check, npm run lint.


### Git Commits

| Hash | Message |
|------|---------|
| `8302620` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 153: Site session badges and cookie routing

**Date**: 2026-05-18
**Task**: Site session badges and cookie routing
**Branch**: `main`

### Summary

Added unified site-level login badges for Douyin, Bilibili, Xiaohongshu, and YouTube; added app-owned site cookie capture/storage and downloader cookie injection; documented the cross-layer site session contract.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `33e0b68` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 154: Xiaohongshu yt-dlp routing cleanup

**Date**: 2026-05-19
**Task**: Xiaohongshu yt-dlp routing cleanup
**Branch**: `main`

### Summary

Removed Xiaohongshu direct video candidate routing and hidden-detail fallback, routed Xiaohongshu video downloads through yt-dlp-compatible note URLs, preserved image drag/save behavior, and updated related specs/tests.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `03a4638` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 155: Downloader-owned URL extraction

**Date**: 2026-05-19
**Task**: Downloader-owned URL extraction
**Branch**: `main`

### Summary

Removed Electron runtime short-link expansion and X overlay URL rewriting; preserved Xiaohongshu tokenized note URLs and updated downloader-owned URL extraction contracts.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `d8523ff` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 156: Surface yt-dlp clip progress

**Date**: 2026-05-19
**Task**: Surface yt-dlp clip progress
**Branch**: `main`

### Summary

Diagnosed clip downloads staying in resolving state because yt-dlp section/ffmpeg progress was not parsed; added CR-delimited progress handling, clip progress parsing, regression tests, and backend spec notes.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `a97438f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 157: Main window state machine refactor

**Date**: 2026-05-20
**Task**: Main window state machine refactor
**Branch**: `main`

### Summary

Refactored the main floating window compact/full flow into a reducer-owned shell state machine, removed the normal idle-collapse dependency, and added native Electron pointer-boundary input so full mode collapses on mouse leave without requiring focus changes.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `78f30ed` | (see git log) |
| `b30cede` | (see git log) |
| `039ea03` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 158: Browser extension boundary refactor

**Date**: 2026-05-20
**Task**: Browser extension boundary refactor
**Branch**: `main`

### Summary

Shrank the browser extension boundary by removing extension-side short-link expansion, keeping browser-only capture paths, and routing pasted Xiaohongshu video through the backend-first queue path.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `1ed773f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 159: Finish professional project review fixes

**Date**: 2026-05-20
**Task**: Finish professional project review fixes
**Branch**: `main`

### Summary

Reviewed Ameow code hotspots, fixed video selection metadata preservation, bounded dropped-file data URL fallback, updated Electron bridge contract specs, and validated with focused tests plus type-check and lint.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `7853f03` | (see git log) |
| `a807142` | (see git log) |
| `009cf65` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 160: Fix code review findings

**Date**: 2026-05-21
**Task**: Fix code review findings
**Branch**: `main`

### Summary

Reviewed Ameow codebase, fixed high-confidence async extension response, settings state consistency, and process runner abort-listener cleanup issues; updated specs and verified tests/type-check/lint.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `30f0094` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 161: Download pipeline focused code review and fixes

**Date**: 2026-05-21
**Task**: Download pipeline focused code review and fixes
**Branch**: `main`

### Summary

Reviewed the download pipeline, fixed Xiaohongshu drag media preservation, fixed direct-download stream completion semantics, added regression tests, and updated backend contracts.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `08013e6` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
