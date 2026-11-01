# Simplify clip download mode and rebalance extension quality defaults

## Goal

Simplify clip downloads so FlowSelect always uses the current fast slicing strategy, remove the clip mode setting from Settings, and make the browser extension's default quality choice better aligned with fast acquisition plus AE-friendly output.

## Requirements

* Remove the clip download mode selector from the Settings page.
* Keep all new clip downloads on the existing `fast` slicing behavior.
* Preserve backward compatibility for legacy configs that contain `clipDownloadMode`, but stop exposing or persisting that preference in the UI.
* Treat legacy `clipDownloadMode: "precise"` as `fast` at runtime so old configs cannot re-enable the strict precise path.
* Rename extension quality labels to strategy-oriented wording:
  * `Highest` for the current highest-available path
  * `Balanced` for the AE-friendlier default path
  * `Saver` for the lowest-bandwidth path
* Change the browser extension default quality preference to `balanced`.
* Keep internal extension/backend enum values stable as `best | balanced | data_saver` unless code inspection during implementation shows a stronger reason to rename internals too.
* Update cross-layer type/spec documentation to reflect the simplified clip behavior and extension-quality wording/defaults.

## Acceptance Criteria

* [ ] Settings page no longer shows the clip download mode selector.
* [ ] New clip downloads always use the existing `fast` slicing behavior.
* [ ] Existing configs containing `clipDownloadMode: "precise"` do not cause a failure or re-enable strict precise behavior.
* [ ] Browser extension quality UI no longer shows `Auto`; it shows `Highest`, `Balanced`, and `Saver`.
* [ ] Fresh extension installs default to `balanced`.
* [ ] Common YouTube/Bilibili 1080p downloads on `balanced` skip full local transcode when an AE-safe path is available.
* [ ] Lint / typecheck / relevant tests pass.

## Definition of Done

* Tests added or updated where appropriate
* Lint / typecheck / CI green
* Docs/spec notes updated for contract changes
* No hidden path re-enables precise slicing through stale config

## Technical Approach

Unify clip slicing onto the existing `fast` branch by removing the settings UI, removing frontend persistence for `clipDownloadMode`, and making backend config resolution collapse all legacy values to `fast`.

In parallel, keep the internal extension quality enum values stable (`best | balanced | data_saver`) but change popup labels to `Highest / Balanced / Saver` and switch the default stored preference to `balanced`.

This keeps the change low-risk:

* clip downloads become single-path again
* old config files remain readable
* extension message payloads and backend enums do not need a breaking rename
* default yt-dlp routing becomes closer to AE-friendly output for common 1080p workflows without removing an explicit highest-quality path

## Decision (ADR-lite)

**Context**: The product goal for clip downloads is fast rough extraction, not frame-accurate trimming. The current `precise` mode adds a strict GPU/re-encode path that increases complexity and failure modes. Separately, extension `Auto` currently maps to the most aggressive quality strategy, which often triggers local AE normalization work and slows common download flows.

**Decision**: Remove the clip mode setting and standardize clip downloads on the existing `fast` strategy. Rename extension quality labels to `Highest / Balanced / Saver` and make `Balanced` the default for fresh installs.

**Consequences**:

* Users lose a rarely justified precise-cut option, but the default workflow becomes simpler and faster.
* Legacy `clipDownloadMode` config values must be tolerated but ignored.
* `Highest` still preserves the current "true best available" behavior for users who explicitly want it.
* `Balanced` reduces unnecessary post-processing in common cases, but cannot guarantee zero AE normalization when the source platform does not provide an AE-safe codec/container combination.
* New product observation:
  * On Bilibili without membership, `Highest` and `Balanced` can both end up delivering 1080p output.
  * In that case, `Highest` may still choose a less AE-friendly codec/container and trigger slow local normalization, while `Balanced` finishes much faster.
  * This creates a UX gap where the user receives the same practical resolution but a much slower pipeline on `Highest`.

## Out of Scope

* Reworking YouTube clip selection UX itself
* Adding a new per-task advanced slicing override
* Improving clip boundary precision beyond the current rough-cut product goal
* Redesigning backend quality-selection semantics beyond label/default changes unless required to satisfy the acceptance criteria

## Technical Notes

* Files inspected:
  * `src/pages/SettingsPage.tsx`
  * `src-tauri/src/lib.rs`
  * `browser-extension/direct-download-quality.js`
  * `browser-extension/background.js`
  * `.trellis/spec/frontend/type-safety.md`
  * `.trellis/spec/backend/type-safety.md`
  * `.trellis/tasks/archive/2026-03/03-05-clip-mode-settings-fast-default/prd.md`
  * `.trellis/tasks/archive/2026-03/03-05-slice-download-slow-timeout-master/prd.md`
* Current code locations:
  * `src/pages/SettingsPage.tsx:16-30` defines the clip mode UI enum/options.
  * `src/pages/SettingsPage.tsx:115` resolves config value to `fast|precise`.
  * `src/pages/SettingsPage.tsx:468-480` persists mode changes.
  * `src/pages/SettingsPage.tsx:962-995` renders the settings section.
  * `src-tauri/src/lib.rs:380-400` defines `best` vs `balanced` yt-dlp selectors.
  * `src-tauri/src/lib.rs:1679-1700` defines backend clip mode enum and config parse.
  * `src-tauri/src/lib.rs:2748-2795` shows cached slicing behavior diverging between `fast` and `precise`.
  * `src-tauri/src/lib.rs:3874-4024` shows yt-dlp section path diverging between `fast` and `precise`.
  * `src-tauri/src/lib.rs:2205-2455` defines AE-safe output normalization and when full transcode happens.
  * `browser-extension/direct-download-quality.js:6-20` defines `Auto` / `1080p` / `360p`.
* Relevant product observations:
  * Extension `Auto` currently maps to backend `best`.
  * Backend `best` intentionally allows mixed codecs/containers (`bestvideo*+bestaudio/best`) and merges to `mkv` to preserve higher tiers.
  * Backend `balanced` strongly prefers AE-friendlier 1080p MP4/H.264 + M4A/AAC combinations before broader fallback.
  * After any yt-dlp success, the app always runs AE-safe normalization:
    * `Skip` for `MP4 + H.264 + AAC`
    * `RemuxOnly` when only container normalization is needed
    * `AudioTranscode` when video is OK but audio is not AAC
    * `FullTranscode` when codec/container are not AE-safe enough
