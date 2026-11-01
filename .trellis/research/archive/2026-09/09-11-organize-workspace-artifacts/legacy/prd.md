# Organize Ameow workspace and generated artifacts

## Goal and user value

Make the root and nested Ameow workspace easier to navigate, recover space occupied by obsolete duplicates, and keep normal development commands from recreating scattered artifacts. Preserve current development, packaging, documentation and evidence recovery behavior.

## Confirmed facts

- User approved inventory and planning on 2026-09-11, then asked to continue; user subsequently approved the complete presented plan and implementation, including latest-successful portable retention.
- Baseline is `main` at `bc5c21ef`. User-authored AGENTS.md changes were committed separately in that commit. Previous Cindy cleanup is complete and outside this task.
- `research/workspace-inventory.md` covers 56 immediate root entries and bounded nested concentrations. Observed logical sizes: `dist-release` 5,075,044,507 B; `build` 1,292,930,123 B; `.trellis` 1,224,906,614 B. These are inventory figures, not deletion promises or filesystem allocation sizes.
- `mr3-windows-smoke-evidence.json` is tracked, unique historical evidence (3,429 B), with its original producer removed. `simple-icons-16.20.0.tgz` is a 6,479,178 B local ignored download with no identified live consumer. See `research/artifact-lifecycle.md` for producers, readers and search limits.
- Eight old portable verification extractions total 3,445,979,872 B; the current metadata points to a ninth extraction. The root failed-package temporary directory is a 359,919,916 B duplicate of retained task evidence.
- Current output paths already mostly live under build/dist/site directories. Unbounded timestamped portable verification retention is the main measured recurring growth source.

## Requirements

- R1: Use the retained inventory and a fresh implementation preflight to classify tracked, ignored and local data. Exact allowlists govern any cleanup; age/name/ignored status alone is insufficient.
- R2: Remove the named root download if the recommended scope is approved; retain MR3 evidence through relocation and make it discoverable under its existing archived task.
- R3: Consolidate generated screenshots beneath the existing build directory with all existing images preserved, update the live capture default and relevant references, and preserve explicit output overrides. Correct obsolete capture guidance without recreating the retired docs capture tool.
- R4: Remove the tracked obsolete extension package snapshot and selected local duplicate outputs/backups. Preserve all current source, runtime inputs, active task data, unique archived evidence, user downloads, credentials, tool metadata and links to external targets.
- R5 (revised by user approval): Keep packaging behavior unchanged. Handle obsolete portable extractions through one-time manual cleanup, preserving the extraction referenced by current metadata and current mirror/ZIPs. Automatic post-success pruning is out of scope.
- R6: Preserve established build/CI/runtime path contracts and validate affected workflows. Do not reorganize source architecture, rewrite Git history, add dependencies, add a generic cleanup framework, or automatically stop processes.
- R7: Deliver measured before/after path changes and logical byte totals for disjoint deleted roots; distinguish removal from relocation and local disk cleanup from tracked repository changes.

## Acceptance criteria

- [x] AC1 (R1): All 56 immediate root entries and meaningful bounded nested concentrations have classifications and concrete rationale; dependency/Git trees and external link targets were excluded.
- [x] AC2 (R2): The two user examples have exact Git status, purpose, producer/reader analysis and proposed dispositions.
- [x] AC3 (R2, R3): The loose tarball and MR3 root file are gone; MR3 bytes survive at the chosen archive path. All screenshot bytes survive under build and capture defaults/overrides work; the old capture root is gone after a verified migration.
- [x] AC4 (R4): Approved obsolete snapshot/backup/duplicate paths are removed or individually reported blocked, with protected paths intact. Conditional stale build children remain protected until their prerequisite evidence passes.
- [x] AC5 (revised R5): Automatic pruning is absent and the portable script matches baseline exactly. Manual deletion remains outstanding under AC4.
- [x] AC6 (R6, R7): Relevant lint/type-check, capture, package and documentation checks pass; final report identifies exact retained/moved/deleted/blocked paths and measured space, with no history rewrite or unrelated changes.
- [x] AC7 (R7): PRD, design, execution plan and real context manifests were reviewed and approved; task is in progress.

## Scope and exclusions

The exact proposed allowlist and conditional/deferred candidates are in design.md. Root configuration, src/electron architecture, public docs source, desktop-assets runtimes/licenses, active tasks and unique archived evidence stay in place. Node dependency trees, machine-wide caches, credentials, user data, current release artifacts, .git and runtime/session metadata are excluded. No push or branch switch is authorized by this planning phase.

## Decision gate

No repository fact blocks the proposed first pass. User review must approve or amend the explicit scope and latest-successful-portable retention recommendation before implementation. That approval also chooses deletion of the unused tarball and obsolete local rollback backups; otherwise these remain untouched.

## Approved decision

On 2026-09-11 the user approved the presented scope and asked to start implementation. The review gate above is satisfied for the current design; materially broader changes still require review.

## Final check disposition — 2026-09-11

The authoritative result is [evidence/final-check-report.md](evidence/final-check-report.md). Migration source gate passed; overall task remains incomplete and must not be archived.

- Capture output migrated to `build/docs-screenshot-captures/`; all 18 paths survived migration. Twelve historical images retain their hashes; five Lab images were subsequently regenerated by successful capture checks. The default and explicit override passed verification.
- MR3 evidence moved into its original archived task with identical bytes and a working discovery link. Root entries decreased from 56 to 54 through relocation only.
- All deletion candidates remain policy-blocked: 4,817,299,951 logical bytes, with no reclaimed-space claim. The root tarball and obsolete tracked extension snapshot remain; AC3/AC4 are not claimed fully complete.
- Automatic retention failed controlled ownership, locked-file preservation and concurrent-publication checks. `scripts/package-portable.ps1` was restored byte-for-byte to `bc5c21ef`; R5/AC5 remain unmet. Real release data was not modified by retention tests.
- Lint, type-check and relevant migration/package checks passed. Proposed scope revision: retain manual cleanup and defer automatic packaging deletion; this revision is pending user decision, not an accepted requirement change.
- Present the verified migration-only commit plan under workflow Phase 3.4. Do not include rejected scripts/fixtures or archive the task while its remaining scope is unresolved.

## Accepted scope revision and commit approval

User confirmed: “同意改为手动清理，并先提交上述迁移改动”. This supersedes the pending recommendation above: automatic retention is removed from scope, remaining deletion is manual, and the migration-only commit is authorized. Task stays in progress until manual cleanup is resolved; no push, branch switch or archive is included.

## Manual cleanup verified — supersedes earlier blocked status

User reported deletion complete. Independent check in evidence/manual-cleanup-check-report.md passed: all 32 exact candidate paths absent, exactly 49 expected obsolete extension snapshot deletions, zero unexpected content changes, root entries 56 to 53. Protected release extraction/mirror/ZIP manifests match, migrated screenshots and MR3 are intact, portable script equals baseline, and fresh lint/type-check plus scoped whitespace checks pass. All revised acceptance criteria now have evidence. Historical candidate content totaled 4,817,299,951 logical bytes; actual disk recovery was not measured. Remaining work is the deletion commit and task/journal bookkeeping under the commit gate, not further cleanup or automatic retention.