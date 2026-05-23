# Execution Plan

1. [x] Complete Phase 1 low-risk cleanup.
2. [x] Run focused validation for Phase 1.
3. [x] Commit Phase 1.
4. [x] Complete Phase 2 spec/doc alignment.
5. [x] Run focused validation for Phase 2.
6. [x] Commit Phase 2.
7. [x] Complete Phase 3 extension legacy cleanup.
8. [x] Run focused validation for Phase 3.
9. [x] Commit Phase 3.
10. [x] Complete Phase 4 packaging/release cleanup.
11. [x] Run focused validation for Phase 4.
12. [x] Commit Phase 4.
13. [x] Run cross-phase validation and summarize remaining risks.

## Progress Notes

### Phase 1

- Removed confirmed unused files:
  - `src/engines/base-engine.ts`
  - `src/components/MaterialGrid.tsx`
  - `src/sites/template.ts`
  - `src/App.css`
  - `src/assets/react.svg`
- Removed obvious unused public asset:
  - `public/tauri.svg`
- Removed redundant/no-op package scripts:
  - `preelectron:build`
  - `typecheck`
- Validation completed:
  - `npm run type-check`
  - `npm run lint`
- `vite.config.ts` `TAURI_DEV_HOST` was intentionally left for a later phase because it still affects current dev-server host/HMR behavior and is not zero-risk.

### Phase 2

- Updated living spec indexes to describe the current Electron-first runtime instead of Tauri/Rust.
- Updated key frontend/backend guidance files that were still presenting Tauri APIs or Rust command patterns as current implementation guidance.
- Strengthened the retired status of `direct-download-onboarding-contracts.md` so it is treated as historical background only.
- Preserved `docs/electron-parity-verification.md` unchanged because it is a current and accurate migration-status document.
- Validation completed:
  - focused repository grep against the touched living spec files
- Known remaining scope:
  - deeper long-form contract docs such as `type-safety.md` and parts of `electron-runtime-contracts.md` still contain migration-era Tauri references and should be handled in a follow-up doc cleanup pass if desired.

### Phase 3

- Removed the disconnected legacy picker path:
  - `browser-extension/content-script.js`
  - `browser-extension/picker.js`
  - `browser-extension/picker.css`
  - corresponding `start_picker` / `stop_picker` handling in `browser-extension/background.js`
- Removed unregistered detectors and orphaned companion assets:
  - `browser-extension/weibo-detector.js`
  - `browser-extension/douyin-detector.js`
  - `browser-extension/instagram-detector.js`
  - `browser-extension/zhihu-detector.js`
  - `browser-extension/injection-debug-panel.js`
  - `browser-extension/weibo-button.css`
  - `browser-extension/douyin-button.css`
  - `browser-extension/zhihu-button.css`
- Validation completed:
  - focused repository grep for removed extension residue
  - `npm run test -- browser-extension/manifest.test.js browser-extension/twitter-detector.test.js browser-extension/youtube-detector.test.js browser-extension/bilibili-detector.test.js browser-extension/video-selection-routing.test.js`
  - `npm run lint`
  - `npm run type-check`

### Phase 4

- Updated `scripts/package-browser-extension.mjs` so staged extension artifacts remove `*.test.js` files before ZIP packaging.
- Removed unused macOS release workflow matrix fields from `.github/workflows/release.yml`.
- Validation completed:
  - `node --check scripts/package-browser-extension.mjs`
  - `npm run lint`
  - `npm run type-check`
- Environment limitation:
  - repository-local YAML parsing validation was not run because the current Node environment does not have a `yaml` package installed.

### Follow-up: Vite Dev Host Residue

- Removed the dead `TAURI_DEV_HOST` branch from `vite.config.ts`.
- Simplified Vite renderer dev-server config to the behavior already enforced by the Electron dev harness:
  - `server.host = false`
  - removed legacy custom HMR host block
- Validation completed:
  - focused repository grep confirms `TAURI_DEV_HOST` no longer exists in the repo
  - `npm run lint`
  - `npm run type-check`
  - `npm run test -- electron/windowRouting.test.mts`

## Final Summary

- Cleanup delivered in five commits:
  - `feefc7d` `chore(cleanup): remove low-risk dead files and residue`
  - `c9d5de9` `docs(cleanup): align living specs with electron runtime`
  - `2ab39c2` `chore(cleanup): remove disconnected extension legacy paths`
  - `bb87547` `build(cleanup): stop shipping extension test residue`
  - `b8d347f` `chore(cleanup): remove dead tauri dev host config`
- Cross-phase validation status:
  - targeted tests passed for extension and window-routing surfaces
  - `npm run lint` passed after implementation phases
  - `npm run type-check` passed after implementation phases
- Remaining follow-up opportunities:
  - deeper long-form spec files still contain some migration-era Tauri references
  - repository-local YAML validation tooling was unavailable in this environment, so workflow syntax was not programmatically parsed via a local YAML package
