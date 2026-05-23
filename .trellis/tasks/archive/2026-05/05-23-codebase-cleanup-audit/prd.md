# Audit codebase for leftover, unused, and legacy mechanisms

## Goal

Produce a repository-wide cleanup audit that identifies likely leftover features, unused code, stale compatibility layers, and legacy mechanisms that no longer serve current product/runtime behavior.

## Requirements

- Review frontend, backend/runtime, browser-extension, and scripts/build areas.
- Prefer evidence-backed findings over speculative “might be unused” guesses.
- Separate clearly between:
  - definitely unreachable/dead
  - likely obsolete or superseded
  - duplicated/parallel mechanisms that increase maintenance cost
- Call out whether each finding looks safe to remove now or needs validation first.
- Do not change product code in this task; this is a read-only audit.
- Note any areas where tooling/runtime constraints prevent high-confidence verification.

## Acceptance Criteria

- [x] Audit covers at least frontend, backend/runtime, and scripts/build surfaces.
- [x] Findings include concrete file references and rationale.
- [x] Findings distinguish confidence level and cleanup risk.
- [x] Report highlights the most valuable cleanup candidates first.
- [x] Report notes any ambiguous areas that need follow-up validation before deletion.

## Notes

- User explicitly requested a cleanup-oriented audit to find leftovers, unused code, and old mechanisms.
- Current environment cannot run local Trellis Python helpers, so task artifacts are created manually.

## Audit Summary

### High-confidence cleanup candidates

- Unused source files:
  - `src/engines/base-engine.ts`
  - `src/components/MaterialGrid.tsx`
  - `src/sites/template.ts`
  - `src/App.css`
  - `src/assets/react.svg`
- Browser-extension legacy picker path appears unreachable:
  - `browser-extension/content-script.js`
  - `browser-extension/picker.js`
  - `browser-extension/picker.css`
  - corresponding `start_picker` / `stop_picker` handling in `browser-extension/background.js`
- Browser-extension detectors that are present in the repo but not registered in `browser-extension/manifest.json`:
  - `browser-extension/weibo-detector.js`
  - `browser-extension/douyin-detector.js`
  - `browser-extension/instagram-detector.js`
  - `browser-extension/zhihu-detector.js`
  - related CSS/debug assets
- Tauri-era residue and stale docs/specs remain in `.trellis/spec/` and a few config/assets such as `vite.config.ts` and `public/tauri.svg`.
- Build/package residue:
  - `scripts/package-browser-extension.mjs` currently copies the entire extension directory, including test files, into staged release assets.
  - `.github/workflows/release.yml` contains unused macOS matrix fields.

### Important nuance from Claude review

- `docs/electron-parity-verification.md` is current and should be preserved.
- `src/download-capabilities/provider-migration-targets.ts` is active code; only some wording inside it looks historical.
- Unregistered detectors and the picker path are strong cleanup candidates, but they should be treated as intentionally disabled vs permanently retired until confirmed during implementation planning.

### Recommended implementation phases

1. Low-risk dead files and obvious Tauri residue.
2. Trellis/spec/documentation alignment with the Electron runtime.
3. Browser-extension retired mechanisms and disconnected detectors.
4. Build/release packaging cleanup so dead assets/tests stop shipping.
