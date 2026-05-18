# Download Capability Registry Foundation

## Goal
Evolve FlowSelect's download subsystem from scattered hardcoded site routing into a data-driven capability system backed by:

- generated upstream support seeds
- project-maintained manual strategy overlays
- typed runtime registry queries
- future probe and telemetry pipelines
- gradual provider migration without destabilizing current download behavior

## Problem Statement
FlowSelect currently relies on three downloader engines:

- `yt-dlp`
- `gallery-dl`
- `direct`

The original system was built around `yt-dlp`, with `gallery-dl` and `direct` added later for sites where `yt-dlp` is weak, unstable, or unsuitable.

The core maintenance problem is no longer "support more sites manually", but:

- official upstream support lists are too large to validate by hand
- upstream "supported" does not mean "currently works"
- backend engine capability and frontend interaction capability are different concerns
- provider behavior is still largely expressed as handwritten branching logic
- there is no probe/telemetry loop to turn real outcomes into maintained strategy data

## Current Status

### Completed
- [x] Task directory and Trellis context initialized
- [x] Typed capability registry models created
- [x] Zod schemas for seed, download capability, interaction capability, and site strategy created
- [x] Generated upstream seed flow implemented for `yt-dlp` and `gallery-dl`
- [x] Static generated seed committed into the repo
- [x] Manual capability overlay for current first-party site strategy added
- [x] Runtime registry loader and merged seed/overlay registry added
- [x] Registry query helpers added for strategy, preferred engine, supported engines, and interaction modes
- [x] Alignment tests added between current provider routing and manual strategy overlay
- [x] GitHub Actions workflow added to regenerate the upstream seed on a schedule or manual trigger
- [x] Registry planning helpers, error classification, probe runners, telemetry sink, and interaction capability diagnostics added
- [x] Low-risk provider adoption completed for `generic` and `youtube`

### In Progress Overall
- [x] Add probe status write-back candidate flow with manual review artifacts
- [x] Extend local reporting with HTML output and migration/probe visibility

## Requirements

### Foundation Requirements
- Maintain typed schemas for download-capability, interaction-capability, and site-strategy registry data.
- Keep an upstream-generated static seed file that the app can load locally without network access.
- Keep the upstream generator outside the Electron runtime path.
- Support a checked-in manual overlay for project-maintained routing knowledge.
- Preserve current download behavior until explicit migration phases are completed.

### Migration Requirements
- Introduce registry-backed query APIs that can answer:
  - preferred engine
  - allowed engine order
  - forbidden engines
  - supported interaction modes
  - URL-to-site strategy lookup
- Gradually migrate provider logic to read registry data without breaking current known-good routes.
- Add safety-net tests that keep manual strategy data aligned with provider behavior during migration.

### Probe And Telemetry Requirements
- Add a lightweight probe model that can express:
  - claimed support
  - verified support
  - auth-required support
  - unstable support
  - broken support
- Add telemetry events that capture:
  - site ID
  - interaction mode
  - engine chain
  - chosen engine
  - success/failure
  - error classification
- Make the registry shape compatible with future probe and telemetry enrichment.

### Error-Policy Requirements
- Replace broad "fallback on anything" behavior with explicit categories such as:
  - retry same engine
  - fallback to another engine
  - terminal for site strategy
  - input invalid
  - auth required
- Ensure future fallback logic can be expressed by registry strategy plus engine error type.

## Phases

### Phase 1: Seed And Registry Foundation
Status: completed

Scope:
- schema
- types
- generated seed
- manual overlay
- registry loader
- registry query helpers
- alignment tests
- CI seed refresh workflow

Acceptance:
- [x] Capability registry types and Zod schemas exist and validate the internal seed format.
- [x] Generated and manual seed JSON files exist and can be imported by application code.
- [x] A generator script builds the upstream seed from official source documents.
- [x] The generated seed records source provenance and marks imported entries as claimed support, not verified support.
- [x] Runtime code loads the bundled registry snapshot and answers basic strategy queries.
- [x] Existing provider routing behavior remains unchanged.
- [x] Targeted tests for the new foundation pass.

### Phase 2: Provider Migration Preparation
Status: completed

Scope:
- map current provider facts into registry-driven lookup contracts
- identify where provider code can delegate to registry without losing site-specific normalization
- keep existing provider behavior as the source of truth during transition

Acceptance:
- [x] Provider-specific normalization and registry strategy responsibilities are explicitly separated.
- [x] Registry-backed helpers exist for provider migration inputs.
- [x] Current first-party site providers have explicit migration targets documented or codified.

### Phase 3: Engine Error Classification
Status: completed

Scope:
- define engine error classes and fallback semantics
- thread those classes through orchestrator/runtime boundaries
- prepare site strategies to consume error-policy decisions

Acceptance:
- [x] Error categories distinguish retry, fallback, terminal, invalid-input, and auth-required outcomes.
- [x] Orchestrator logic can decide whether to continue the engine chain based on classified errors.
- [x] Tests cover representative fallback and terminal cases.

### Phase 4: Probe Pipeline
Status: completed

Scope:
- lightweight `yt-dlp` probe
- lightweight `gallery-dl` probe
- lightweight direct-head/range probe
- probe result shape compatible with registry state updates

Acceptance:
- [x] Probe result schema exists.
- [x] Probe runners can execute against representative URLs without invoking full downloads.
- [x] Probe outcomes can be mapped onto registry statuses such as `works`, `works_with_auth`, `unstable`, `broken`.

### Phase 5: Telemetry Pipeline
Status: completed

Scope:
- define structured download outcome events
- persist or emit outcome events from runtime execution
- keep the payload small but sufficient for strategy feedback loops

Acceptance:
- [x] Runtime emits structured download outcome data.
- [x] Event shape captures site, interaction mode, engine chain, chosen engine, and classified outcome.
- [x] Data model is suitable for future aggregation or local reporting.

### Phase 6: Registry-Driven Provider Adoption
Status: completed

Scope:
- start moving selected providers from hardcoded engine order to registry-backed strategy selection
- preserve provider-owned normalization and candidate filtering where needed
- roll out by low-risk site groups first

Acceptance:
- [x] At least one existing provider uses registry strategy data for engine ordering.
- [x] Regression coverage confirms unchanged behavior for migrated sites.
- [x] Migration approach is repeatable for remaining providers.

### Phase 7: Interaction-Capability Integration
Status: completed

Scope:
- connect manual/derived interaction capability data to extension/runtime adapter work
- create a clear contract for which sites need detector specialization vs generic support

Acceptance:
- [x] Interaction capability data is consumable by future extension/runtime decision points.
- [x] Current known special-adapter sites are represented explicitly.
- [x] Detector/runtime work can be prioritized using registry data instead of ad hoc notes.

### Phase 8: High-Value Provider Migration
Status: completed

Scope:
- migrate `weibo`, `pinterest`, `douyin`, and `xiaohongshu` to registry-backed engine ordering
- preserve provider-owned normalization, direct-candidate filtering, and site-specific source URL shaping
- keep regression coverage tight so behavior stays unchanged while adoption expands

Acceptance:
- [x] `weibo`, `pinterest`, `douyin`, and `xiaohongshu` use registry strategy data for engine ordering where appropriate.
- [x] Provider-owned URL normalization and candidate filtering remain explicit and test-covered.
- [x] Alignment tests prove manual strategy data still matches migrated provider behavior.

### Phase 9: Probe Automation Integration
Status: completed

Scope:
- add a batch probe CLI/script around the existing probe runners
- connect probe execution to CI or the seed generation pipeline
- define how probe results update capability status artifacts without entering the app runtime path

Acceptance:
- [x] Probe runners are invokable through a repository script or CLI for batch execution.
- [x] CI or generator flow can execute probes and emit machine-readable results.
- [x] Probe outputs are structured so future seed/probe status updates are deterministic.

### Phase 10: Telemetry Reporting
Status: completed

Scope:
- generate local summary reports from download telemetry JSONL
- surface success rate, auth-heavy sites, and high-risk engine/site combinations
- keep the reporting flow local/offline and suitable for future expert review inputs

Acceptance:
- [x] A local reporting script can aggregate telemetry JSONL into a readable summary artifact.
- [x] Report output highlights success rate, auth-required hotspots, and risky engine/site combinations.
- [x] Reporting contract is documented enough to avoid silent field drift in future consumers.

### Phase 11: Expanded Probe Coverage
Status: completed

Scope:
- expand `capabilities-probe-targets` beyond the initial representative set
- prioritize migrated high-value providers and historically fragile engine/site combinations
- introduce light target metadata that helps distinguish critical, auth-sensitive, and coverage-only probes

Acceptance:
- [x] Probe target data covers the migrated high-value providers with at least one maintained representative URL each.
- [x] Probe target structure can express target priority/tier without complicating the runner contract.
- [x] Batch probe execution and snapshot generation continue to work with the expanded target set.

### Phase 12: Probe Write-Back Review Flow
Status: completed

Scope:
- derive review-ready capability update candidates from probe snapshots instead of writing directly into the runtime seed
- keep a clear manual confirmation checkpoint before probe observations influence maintained registry data
- make the review artifact suitable for CI output and expert/operator inspection

Acceptance:
- [x] A script or generator step can turn probe snapshots into a machine-readable review artifact.
- [x] Review output clearly separates observed probe status from currently maintained capability status.
- [x] No automatic mutation of the main capability registry occurs without explicit maintainer action.

### Phase 13: Reporting And Progress Visibility
Status: completed

Scope:
- add HTML output for local telemetry reporting so the summary is easier to inspect and share
- surface provider-migration progress and probe-status distribution in the reporting layer
- keep telemetry and probe reporting aligned with the documented schema contracts

Acceptance:
- [x] Local reporting can emit an HTML artifact alongside the existing summary outputs.
- [x] Report output includes migrated-provider progress and probe-status summary sections.
- [x] Reporting changes remain offline/local and do not add runtime dependencies to the Electron app.

## Acceptance Criteria
- [x] The project has a stable capability-registry foundation committed in small phases.
- [x] Remaining download-system migration work is decomposed into explicit phases with clear acceptance criteria.
- [x] Future work can proceed phase-by-phase with one commit per completed phase.
- [x] The PRD reflects both completed work and the final implementation outcome.
- [x] The post-Phase-10 roadmap was executed phase-by-phase through reporting and review visibility.

## Technical Notes
- Official upstream lists are seed inputs only; they do not imply verified support.
- Download capability and interaction capability must remain separate concerns.
- Manual project strategy overlay is the current authoritative expression of FlowSelect-specific site routing knowledge.
- Provider migration should be incremental and test-backed; do not switch all routing to registry data in one step.
- Keep generator-side automation outside the app runtime.
- Preserve existing user-visible behavior unless the active phase explicitly targets runtime behavior changes.
- Probe-derived status changes should first land as review candidates, not direct registry mutations.
- Reporting should remain local/offline, but may emit HTML artifacts for easier expert review and team visibility.
