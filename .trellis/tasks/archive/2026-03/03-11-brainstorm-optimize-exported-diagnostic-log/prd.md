# brainstorm: optimize exported diagnostic log

## Goal

Reduce noise in the exported diagnostic log so it is faster to scan during troubleshooting, while still preserving the small set of environment, settings, downloader, and recent runtime signals that usually explain user-facing failures. The export should also be updated to reflect the current downloader surface, including `pin-dlp`, instead of only the legacy `yt-dlp`-centric view.

## What I already know

* The export entry point is `export_support_log()` in `src-tauri/src/lib.rs`.
* The current export contains:
  * header fields such as app version, OS, arch, executable path, config path, output log path, runtime log path
  * `ytdlp_path` and `ytdlp_version`
  * a full pretty-printed config JSON via `format_support_log_config()`
  * the last `180` runtime log lines via `read_recent_runtime_log_excerpt()`
* `format_support_log_config()` currently does no filtering; it serializes the whole config object.
* `pin-dlp` already has a backend info source: `get_pinterest_downloader_info()` returns:
  * `current`
  * `packageName`
  * `flowselectSidecarVersion`
  * `updateChannel`
* The settings UI exposes or loads several effective states that are diagnostic-relevant but are not all represented cleanly in the current export:
  * theme
  * language
  * output path
  * shortcut
  * autostart
  * rename toggle / preset / prefix / suffix
  * AE integration toggle / executable path
  * `ytdlpQualityPreference`
  * downloader versions and statuses for `yt-dlp` and `pin-dlp`
* `autostart` is runtime state from `get_autostart()`, not just raw config.
* The current log export is still structurally "full config dump + raw runtime tail", which is why noise is high and newly added downloader metadata is missing.

## Assumptions (temporary)

* The main complaint is scan efficiency during manual diagnosis, not archival completeness.
* Exported diagnostics should prefer effective-state summaries over raw storage snapshots.
* Paths are still useful for troubleshooting, but large raw blocks and repetitive runtime lines are not.
* A single exported file is still preferred for the current UX unless there is a strong reason to split summary vs raw content.

## Requirements (evolving)

* Replace the raw full-config dump with a curated diagnostic summary.
* Keep the existing export trigger and a single-file workflow.
* Include key app/runtime environment fields that help reproduce issues:
  * app version
  * generated timestamp
  * OS
  * arch
  * executable path
  * config path
  * runtime log path
* Include the effective settings most likely to affect behavior:
  * output path
  * autostart
  * shortcut
  * rename media toggle / preset / prefix / suffix
  * AE portal enabled / executable path
  * `ytdlpQualityPreference`
* Exclude secondary UI-only settings such as theme and language from the MVP diagnostic summary to keep noise low.
* Include downloader diagnostics as a first-class section instead of only loose `yt-dlp` fields.
* Downloader diagnostics should cover at least:
  * `yt-dlp` local binary path and current version
  * `pin-dlp` current version
  * `pin-dlp` package name
  * `pin-dlp` FlowSelect sidecar version
  * update channel and delivery model where relevant
* Reduce runtime log noise so the exported file is primarily diagnostic signal, not raw transcript.
* Keep a filtered runtime evidence section in the same exported file instead of removing runtime evidence entirely.
* The filtered runtime evidence section should keep:
  * error and warning lines
  * a small number of lifecycle and routing lines that explain downloader start, route selection, fallback, and terminal outcome
* Preserve enough information to diagnose common failures around:
  * wrong output folder
  * rename rules
  * shortcut and autostart mismatch
  * AE integration path and config
  * downloader version drift or packaging mismatch
  * recent downloader and runtime errors

## Acceptance Criteria (evolving)

* [ ] Export no longer includes the full pretty-printed raw config JSON.
* [ ] Export includes a curated settings summary covering the currently supported settings surface chosen for the MVP.
* [ ] Export includes `pin-dlp` diagnostic metadata.
* [ ] Exported content is materially shorter and easier to scan than the current format.
* [ ] Export still contains a filtered runtime evidence section with enough signal to diagnose common downloader and configuration issues.
* [ ] Runtime evidence is sufficient to reconstruct the failure path without dumping a large raw tail.
* [ ] Existing export UX from the version tap remains functional.

## Definition of Done (team quality bar)

* Tests added or updated where practical for export formatting behavior
* Lint / typecheck / CI green
* Docs or notes updated if behavior changes materially
* Rollout and rollback considered if risky

## Research Notes

### Current repo pattern

* Current export behaves like a raw snapshot, not a diagnostic report.
* Settings and runtime state are now spread across:
  * raw config JSON
  * dedicated runtime getters such as `get_autostart()`
  * downloader-specific commands such as `check_ytdlp_version()` and `get_pinterest_downloader_info()`

### Constraints from this project

* `pin-dlp` updates ship with app releases, so its diagnostic section should communicate packaged-version metadata rather than imply a standalone updater.
* The export is triggered from a hidden-but-existing support gesture in `SettingsPage.tsx`, so the workflow should stay lightweight.
* The codebase already distinguishes user-facing summary state from raw storage in multiple places; support-log export should follow the same effective-state principle.

### Feasible approaches here

**Approach A: Summary-first single file with filtered runtime excerpt** (Selected)

* How it works:
  * export a small number of named sections: environment, effective settings, downloaders, recent diagnostic events
  * replace full config dump with a whitelist-based summary
  * replace raw last-180-lines tail with filtered lines or a smaller categorized excerpt
* Pros:
  * keeps one-file support workflow
  * removes most noise while preserving recent failure context
  * easiest upgrade path from current implementation
* Cons:
  * still needs careful filter rules to avoid missing an edge-case line

**Approach B: Pure summary single file**

* How it works:
  * export only structured summary sections, no raw runtime excerpt
* Pros:
  * cleanest and shortest output
  * easiest for humans to scan quickly
* Cons:
  * may hide the one raw line that explains an uncommon failure

**Approach C: Summary file plus separate raw companion log**

* How it works:
  * export the main summary file and also emit a raw runtime companion file
* Pros:
  * best balance of scanability and completeness
  * avoids stuffing raw detail into the main summary
* Cons:
  * changes the support workflow
  * more UX and implementation overhead

## Future / Related / Edge Sweep

### Future evolution

* The downloader section will likely grow again if FlowSelect adds more sidecars or route-specific diagnostics.
* A modular export builder by section is worth preserving now so future additions do not regress into another giant raw dump.

### Related scenarios

* Support-log export should stay aligned with what the settings page actually exposes as controllable state.
* Downloader diagnostics should use the same source of truth as the settings cards to avoid mismatched version reporting.

### Failure and edge cases

* Some metadata lookups can fail independently; export should degrade gracefully with `unavailable (...)` style placeholders instead of aborting.
* Runtime filtering must still retain warning and error lines plus recent downloader lifecycle lines that explain failures.

## Technical Approach

Tentative direction: convert support-log generation from a raw config dump plus tail log into a sectioned report assembled from effective runtime/config getters plus downloader-specific info providers. Keep a small runtime evidence section containing errors, warnings, and the minimal lifecycle and routing breadcrumbs needed for diagnosis.

## Decision (ADR-lite)

**Context**: The current export is noisy because it combines a full raw config dump with a large unfiltered runtime tail, while newer downloader metadata such as `pin-dlp` is missing.

**Decision**: Use a single exported file that is summary-first, but still keeps a filtered runtime evidence section.

**Consequences**:

* The exported file remains easy to share and inspect.
* We avoid the UX overhead of a separate raw companion log.
* The runtime evidence filter will keep errors and warnings plus a very small amount of lifecycle and routing context.
* The curated settings summary will stay download-diagnostic-focused and will exclude secondary UI-only settings such as theme and language.

## Out of Scope (explicit)

* Redesigning the hidden version-tap export UX
* Building a full in-app diagnostic viewer
* Adding a standalone updater for `pin-dlp`
* Broader logging refactors outside what is necessary for export usefulness

## Technical Notes

* Relevant files:
  * `src-tauri/src/lib.rs`
  * `src/pages/SettingsPage.tsx`
  * `src/types/pinterestDownloader.ts`
  * `.trellis/spec/backend/logging-guidelines.md`
  * `.trellis/spec/backend/pinterest-sidecar-maintenance-contracts.md`
* Current export implementation lines inspected:
  * `src-tauri/src/lib.rs:8773`
  * `src-tauri/src/lib.rs:8562`
  * `src-tauri/src/lib.rs:3630`
* Downloader info source inspected:
  * `src-tauri/src/lib.rs:8072`
  * `src-tauri/src/lib.rs:8224`
* Settings and runtime state sources inspected:
  * `src/pages/SettingsPage.tsx:205`
  * `src/pages/SettingsPage.tsx:215`
  * `src/pages/SettingsPage.tsx:268`
  * `src-tauri/src/lib.rs:8856`
  * `src-tauri/src/lib.rs:8879`
