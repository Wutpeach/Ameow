# Current failure incident diagnostics: local implementation planning

## Goal
Users can copy or export the minimum necessary structured diagnostic information for the current / just-failed download incident. Session/runtime log excerpts are not an incident diagnostic source. The user explicitly approved the complete design/implementation plan and lifecycle package on 2026-09-11 and authorized implementation, focused tests, type/lint/docs/locale checks and native/UI smoke.

## Baseline
- Requested baseline: `f1b4991c58982fc5a896e61bf58840c2aeec9cfa`.
- Observed local main/HEAD: `9440310326382691217e606664ef53de001dd9fa`.
- Completed research verified equality of cited chain files across these commits. The planning delta inspected current main; recheck touched files before later implementation.
- Implementation entry HEAD: `b7b254e72cd2ae1e351df0a573ad2ac80ba33b92`; intervening changes are docs-site integration, including an updated docs-site spec. Preserve them and use current docs validation rules. Application/Electron/renderer incident source files did not change between planning HEAD and entry HEAD.

## Confirmed facts and decisions
- Completed research: `research/diagnostic-export-ownership.md`; product-target qualification: `research-review.md`.
- The default runtime adapter writes typed events into session text (`src/electron-runtime/downloadDiagnosticSink.ts:7`); Support Log exports recent lines without incident selection (`electron/supportLogExport.mts:28`). Filtering its diagnostic lines is not the accepted final solution.
- Quick Copy already consumes typed incident facts without session logs (`electron/errorDiagnosticCopy.mts:248`). Reuse its source/projection seam for user incident egress.
- Application owns closed diagnostic events, bounded attempts and terminal semantics (`src/application/download-diagnostics.ts:178`). Those semantics and responsibilities must not change.
- Current Quick Copy dismisses the foreground outcome on success (`src/App.tsx:761`); a failed download currently requests a 5000 ms reveal, and background terminals can be suppressed (`src/App.tsx:1359`). Availability must be explicitly resolved, not assumed to be durable.
- Runtime/session diagnostic logging may remain as independent developer observation. No persistent diagnostic store or historical incident archive.

## Requirements
- R1: Incident copy/export consumes only the selected current failure's structured projection, with existing allowlisting, bounded attempts and redaction retained.
- R1 compatibility: Download reports without typed attempts remain sparse and structured; the shared builder must not fall back to legacy raw-message evidence. Existing bounded Transcode evidence remains outside this behavior change.
- R2: Copy and file egress share the existing incident report construction and formatting logic. Neither reads session logs or independently assembles report fields.
- R3: The current/just-failed incident remains usable for the intended interaction; explicit dismissal, replacement, pending egress and failure/cancellation behavior must be documented.
- R4: Support Log remains a clearly labeled session-level support/developer export; UI/help must not direct users there for the single-incident report.
- R5: Changes stay within incident presentation/action, Electron command/egress, typed bridge wiring, local tests, locale and user-help boundaries.

## Acceptance criteria
- AC1 / R1: A report for incident A includes only A's structured facts; adding incident B and unrelated runtime lines cannot change A's diagnostic content.
- AC2 / R1-R2: No session/runtime log reader is used by either incident egress; missing typed data never triggers log fallback.
- AC3 / R4: Runtime developer logging and the separately labeled Support Log remain independently functional.
- AC4 / R5: Application DownloadDiagnostic semantics and yt-dlp collection are unchanged and acquire no export/UI responsibilities.
- AC5 / R2: With a fixed request/environment/time, clipboard and file egress use the same report text; normalization and redaction are not duplicated.
- AC6 / R3-R5: Availability is limited to current/just-failed incident state; no disk persistence, historical list, restore-on-restart or general repository abstraction is introduced.
- AC7 / R3: Save cancellation and clipboard/file errors preserve the incident and allow retry; stale completion cannot dismiss or replace a newer incident.

## Approved product lifecycle
- Keep one in-memory current/just-failed Download entry until explicit dismissal, authoritative new-download acceptance, replacement by a later failure, or renderer/app teardown. Successful copy/save retains it; save cancellation/error retains it and permits retry. Outcome timeout, collapse/re-expand and queued-task automatic promotion do not clear it or hold the shell open.
- Background Download failures may replace the latest incident without preempting progress/cancel presentation. Download enqueue failures remain sparse structured incidents; do not extend retention to Transcode/image/folder failures.
- Every initiated egress captures its incident. Replacement/clear does not change that output; stale completion must not modify a newer UI state or feedback.
- Capacity is exactly one, with no history, persistence or restart recovery. The user explicitly accepted this package; no blocking product questions remain.

## Constraints
Implement only the approved local plan. No DownloadDiagnostic/Job/orchestrator/yt-dlp semantics changes, logging infrastructure redesign, generic diagnostic repository, new dependencies, history browser or persistent incident storage. Never reconnect incident egress to session log, Support Log or telemetry. Preserve existing user work. A single task is sufficient because the UI, source and egress behavior form one acceptance boundary.

## Planning deliverables
Approved `prd.md`, `design.md`, `implement.md`, and curated manifests are present. Both manifests passed `task.py validate` with nine real spec/research entries each. Product convergence and latest-plan approval are complete. Implementation entry is authorized; completion requires the requested checks and an explicit five-part readiness report.
