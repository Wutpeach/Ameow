# Bug Analysis: Packaged Electron Blank Windows From Root-Relative Assets

### 1. Root Cause Category
- **Category**: B - Cross-Layer Contract
- **Specific Cause**: The packaged Electron runtime loads renderer routes from `file:///.../dist/index.html#...`, but the Vite production build still emitted root-relative `/assets/...` URLs. Under `file://`, those URLs resolve to `file:///assets/...` instead of the bundled `dist/assets/...` directory, so `main` and `settings` showed only their BrowserWindow host backgrounds with no React JS/CSS loaded.

### 2. Why Fixes Failed
1. Transparent-window / compositor investigation: It addressed a real packaged-Windows visibility risk, but not the blank-renderer root cause. The shell could exist while the renderer never loaded.
2. Renderer-ready and startup-state work: It improved reveal sequencing, but the renderer could not become ready if the built JS bundle never loaded from `file://`.
3. Style/contrast hypotheses: They operated one layer too high. When both `main` and `settings` have no text or controls, theme contrast is almost never the primary cause.
4. Expert-brief anchoring: The outside advice focused on DWM/compositor timing, which kept attention on native-window behavior. The build-asset contract between Vite and Electron was never explicitly documented, so it was not checked early enough.

### 3. Prevention Mechanisms
| Priority | Mechanism | Specific Action | Status |
|----------|-----------|-----------------|--------|
| P0 | Documentation | Add `file://` asset-base contract to Electron runtime spec and cross-platform guide | DONE |
| P0 | Process | Treat packaged blank windows as a build/runtime contract check before native-window debugging | DONE |
| P1 | Documentation | Add frontend quality rule to inspect built `dist/index.html` for `./assets/...` in Electron packaged flows | DONE |
| P1 | Runtime Validation | During packaged verification, inspect emitted `dist/index.html` before collecting compositor diagnostics | TODO |
| P2 | Test Coverage | Add a lightweight build artifact assertion that fails if packaged `index.html` references `/assets/` | TODO |

### 4. Systematic Expansion
- **Similar Issues**: Any Electron/Tauri packaged surface that loads Vite output from `file://` can regress the same way, including future onboarding windows, updater UIs, or auxiliary tools.
- **Design Improvement**: Keep one explicit contract for renderer route mode: dev can use `/`, packaged `file://` builds must emit relative asset URLs.
- **Process Improvement**: When a packaged desktop window is blank, first classify whether the failure is `shell only` or `renderer loaded but visually wrong`. That binary split would have cut most of this loop.
- **Knowledge Gap**: The team had good instincts about Electron compositor fragility, but no explicit habit of checking `dist/index.html` output after build-tool changes.

### 5. Knowledge Capture
- [x] Update `.trellis/spec/guides/cross-platform-thinking-guide.md`
- [x] Update `.trellis/spec/guides/cross-layer-thinking-guide.md`
- [x] Update `.trellis/spec/backend/electron-runtime-contracts.md`
- [x] Update `.trellis/spec/frontend/quality-guidelines.md`
- [x] Record task-local bug analysis in this file
- [ ] Add automated build artifact assertion for packaged Electron asset URLs
