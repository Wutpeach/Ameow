# Self-check development status checkpoint

## Goal
Confirm the existing self-check roadmap against current repository code after the recent logging/diagnostics refactor. This is bounded verification of existing work, not new research or roadmap planning.

## Scope and acceptance
- Record branch, full HEAD, and dirty baseline.
- Assess P0, P1, P2-V, P2-A against their existing acceptance evidence and current code; determine actual P2-B progress.
- Trace Diagnostics / DownloadDiagnostic / Report / Log dependencies and ownership through actual callers.
- Preserve: Domain owns facts; Diagnostics observes facts; Logs provide evidence; Report composes user-facing evidence; Repair owns mutation.
- Check for authoritative failure/runtime/lifecycle/candidate/active lease/eligibility inferred from session logs, raw stderr, or exports; report any bypass or duplication of P1/P2-A structured facts.
- Run only relevant repository-grounded checks needed to support the checkpoint. Distinguish historical PASS, current verification, and unverified claims.
- Deliver concise phase statuses, contract changes, top 1-3 deviations with impact, PASS/REPAIR/CONTINUE/STOP verdict, and next phase name/goal.

## Boundaries
No implementation, fixes, new tests, redesign, new roadmap, stage redo, commits, or source/spec/platform edits. Worker may write only checkpoint evidence/report inside this task. Existing dirty .codex/agents/trellis-check.toml and .trellis/tmp/ are user-owned; do not revert or change them. Do not enter the recommended next phase.

## Authorization
User approved creating this checkpoint task. This PRD records the already specified scope; no new product planning is required.

## Authorized follow-up: bounded Report structured-evidence repair

The user subsequently authorized implementation of exactly the two projection omissions documented in checkpoint-report.md. This section supersedes the verification-only boundary above for this follow-up; the historical checkpoint remains unchanged.

- Preserve supplied attempt runtimeCandidate and runtimeSetId through the existing shared normalizer/builder into Copy/Save text, using existing validation/redaction conventions.
- Render existing valid terminal facts even when attempts is empty; the attempts section may be omitted. Missing summaries must remain missing.
- Extend existing shared report tests for both cases and guard privacy, typed classification, and shared Copy/Save projection.
- Expected production edit: electron/errorDiagnosticCopy.mts. Expected regression edits: existing errorDiagnosticCopy.test.mts and, only if necessary to prove sink parity, errorDiagnosticCommands.test.mts.
- No log/stderr reconstruction, new runtime query, execution/selection/lease/Diagnostics authority changes, new report schema/framework, infrastructure refactor, or P2-B implementation.
- Acceptance: focused tests, type-check, relevant validation pass; independent review confirms both omissions resolved and reports any additional findings without expanding scope.
- Stop after this repair. Existing unrelated dirty files remain user-owned.
