# Execution plan — approved

## Status / ownership

- Task: `.trellis/tasks/09-11-organize-workspace-artifacts`, status in_progress; migration verified, remaining cleanup unresolved.
- Baseline branch/commit: `main` / `bc5c21ef`; preserve current branch unless user explicitly changes that preference.
- Research Run `run_101a3e2049c2`, Task `task_f12a5d1c4d37`, Dispatch `ctx_97168cf693ab`: succeeded. Three reports reviewed; completion Delivery `delivery_6c7c53608be2` acknowledged. Worker release returned retained/user_takeover; no reclaimable worker remains. Do not close that terminal.
- Lead owns task artifacts/spec coordination/commits. Implementation and checks must use real Orca workers with selected role TOML read first. Workers must not spawn workers.

## Ordered checklist

- [x] Obtain task-creation/planning consent, create task and seed requirements.
- [x] Inventory root and relevant nested artifacts; retain producer/reader and candidate reports.
- [x] Prepare concrete design, protected paths, conditional checks, retention recommendation and curated context manifests.
- [x] User approved the presented proposal on 2026-09-11, including latest-successful portable retention; activate and implement within the reviewed scope.
- [ ] Snapshot current Git/status and exact allowlist hashes/bytes; distinguish ignored, tracked and new user changes. Check process ownership/inactivity without stopping user processes. Treat changed facts as fresh evidence.
- [ ] Verify active-task references for conditional build candidates; mark unresolved paths retained. Validate current portable metadata, exact ZIP/extraction and archive duplicate before removal.
- [ ] Implement capture default migration and move existing capture files collision-free; preserve all image bytes and explicit output options. Update relevant live references and historical README labeling.
- [ ] Move MR3 historical evidence with identical bytes and a discoverable archive link. Delete only enumerated obsolete extension snapshot paths.
- [ ] Implement bounded latest-successful portable extraction retention only if its safety/failure behavior fits design. Leave previous extraction/metadata on failed packaging and skip uncertain live paths.
- [ ] Execute approved local cleanup per exact allowlist, with containment/reparse checks; record each removed/retained/blocked path. Stop on policy denial rather than bypassing it.
- [ ] Run targeted meaningful validation, then independent Orca check/review. Fix confirmed issues only; no unrelated source changes.
- [ ] Update relevant existing spec/guidance; present Phase 3.4 commit plan. Commit approved tracked changes, then archive/journal only after source work is committed. Do not push.

## Validation gates

- Planning: `python ./.trellis/scripts/task.py validate .trellis/tasks/09-11-organize-workspace-artifacts`; review every candidate/protected path and consistent byte totals. No runtime tests needed yet.
- Tracked source changes: `npm run type-check`, `npm run lint`, and targeted existing capture/package tests where applicable; do not reflexively run all unrelated tests for local file cleanup.
- Capture: existing cleanup self-check, five-scenario capture using new default, and explicit task-owned `--output` override. Verify no extra opener, old output root recreation, cache ownership regression or image loss. Use direct Node invocation because the previous npm forwarding quirk is documented.
- Portable retention: one focused runnable check for success, failure before metadata, wrong-parent/reparse paths, retained current metadata path and safe skip/failure. Controlled owned fixture roots first; real package smoke only after a valid unpacked input exists. Never prune real data merely to test cleanup. Existing `package:portable:skip-build` is not sufficient alone: inventory has no root win-unpacked directory.
- Extension snapshot deletion: current package-browser-extension script and relevant package tests; inspect generated manifest. MR3: source/destination digest and exact old/new reference search.
- Docs: link/reference checks, `npm run docs:build` if developer/public docs links are changed; private capture README edits alone do not require unrelated public docs work.
- Final: scoped `git diff --check`, root before/after list, per-path logical bytes, protected-path checks and all remaining limitations. Do not claim filesystem space reclaimed from a move or from overlapping counts.

## Stop / rollback conditions

No recursive deletion across links or outside explicit roots. No unexpected tracked/user changes included. If a deletion is policy-blocked, finish unaffected reviewable work and report the exact block; no alternate shell/API workaround. If portability/process-safety needs a materially broader retention implementation, return that point for design review. Preserve original ignored files until migration digests match. Restore tracked files through ordinary targeted Git changes when necessary, never reset unrelated work or rewrite history.

## Implementation authorization

User: “是的，开始实施”. Latest presented plan approved on 2026-09-11. Remain on main. No additional deletion, migration or retention approval is needed for the explicit scope, subject to the documented path/process and policy checks. Uncertain conditional build candidates remain skip-and-report. Lead will use separate Orca ownership for portable retention and the migration/local-cleanup batch; no overlap in product files.

## Implementation dispatch history (all settled)

- Migration/local cleanup: Orca Task `task_4a1749696263`, Dispatch `ctx_51ddd693c875`, terminal `term_afe3a6eb-ddfd-431e-9541-063ec47beaea`; owns capture script/default, screenshot+MR3 migrations, obsolete tracked snapshot paths, and approved local cleanup. Report: `evidence/migration-cleanup-report.md`.
- Portable retention: Orca Task `task_9fd7003b539e`, Dispatch `ctx_2ea100069bdc`, terminal `term_5421f9fb-9d9a-4699-a454-bd420273f3f3`; owns `scripts/package-portable.ps1`, one focused runnable check and exclusive fixtures; no live dist-release mutation. Report: `evidence/portable-retention-report.md`.
- Both use trellis-implement, gpt-5.6-terra/xhigh, on Run `run_101a3e2049c2`. Main keeps one filtered lifecycle wait and reviews reports before release/reuse. No native agents or worker progress polling.
- `task.py start` recorded branch main and warned about self-referential PR metadata. This task intentionally stays on main under the approved plan; no PR is planned. At eventual archive, use the documented non-PR branch-validation exception rather than changing the user branch.

## Implementation reports reviewed

- Migration Task `task_4a1749696263` / Dispatch `ctx_51ddd693c875`: completed with failed overall outcome because approved deletion was policy-blocked. Source/capture/MR3 migrations and relevant checks passed. Report read; worker released; Delivery `delivery_17820fa33990` acknowledged.
- Retention Task `task_9fd7003b539e` / Dispatch `ctx_2ea100069bdc`: succeeded for implementation and controlled PS7/Windows PowerShell checks, no live package mutation. Report read; worker released; Delivery `delivery_426a8e7c5079` acknowledged. Independent review must assess locked-file partial deletion and minimality before accepting code.
- Reported blocked disjoint cleanup scope: 4,817,299,951 logical bytes; no deletion savings claimed. Independent source work continues, but full cleanup acceptance remains incomplete.
- Independent checker Task `task_ba19686f201c`, Dispatch `ctx_afcbdd9318dd`, terminal `term_01643799-ef32-444b-9b2a-d7a9e466a925` on the same Run. Read trellis-check TOML (model/effort are commented examples, so overrides omitted). Owned scoped safe fixes, final report and verified existing spec sync; now settled.

## Final disposition and next gate — 2026-09-11

Subsequent user approval: manual cleanup replaces automatic retention, and the proposed migration-only commit is authorized. Proceed with the exact reviewed work-file allowlist on main; keep task records for later bookkeeping and do not archive before manual cleanup is resolved.

Executed migration work commit: `1fc66470` (`chore: organize Lab captures and MR3 evidence`) on `main`. Staged whitespace check passed; Git detected the MR3 move as a 100% rename. No push. Remaining Git status contains this untracked task directory and the previously documented portable-script status indication (no content diff); neither was included. Manual cleanup remains outstanding.

- Read and accepted `evidence/final-check-report.md` as the final result, superseding the initial portable implementation success report and historical open checklist above.
- Preflight/inventory, capture default and migration, MR3 relocation, scoped spec sync and independent validation are complete. All approved deletion attempts remain blocked; no alternate deletion mechanism was used.
- Checker reproduced three retention safety failures. Lead reply `msg_0d99b99b7964` directed targeted baseline restoration; the portable source now has the exact baseline SHA-256 and empty content diff. Rejected source/reproducer and tiny fixture trees remain ignored evidence, not production tests or commit candidates.
- Final checker Delivery `delivery_6895bf7001c3` processed and acknowledged. Worker release returned retained/user_takeover; do not close it. All four dispatches settled, two workers released and two retained/user_takeover; no active lifecycle wait or reclaimable worker remains.
- No branch switch, commit, push or archive performed. Task remains in progress pending remaining-scope decision and Phase 3.4 commit confirmation.
- Proposed work commit: `chore: organize Lab captures and MR3 evidence`. Include `.gitignore`, capture script, frontend directory spec, MR3 relocation and its archive report link. Keep current task planning/evidence records for later task bookkeeping; exclude unchanged portable script, ignored screenshots and rejected fixtures/scripts.
- Recommend manual retention instead of broadening packaging into automatic deletion. Do not silently waive R5 or mark full cleanup complete; obtain the user's scope decision.

## Manual cleanup acceptance

Orca Task task_858d73bb1c56 / Dispatch ctx_e6685d16b000 succeeded. Read evidence/manual-cleanup-check-report.md and verified completion IDs/outcome/report ownership. Worker released; Delivery delivery_205c5e2dc571 acknowledged; no reclaimable workers or unsettled dispatches remain. All revised cleanup acceptance gates pass; prior blocked/open statements above are historical. No additional deletion performed by agents.

Proposed remaining work commit: chore: remove obsolete browser extension snapshot. Exact scope: the single .trellis/tmp/browser-extension-package-check/FlowSelect_0.4.0-beta.8_browser_extension.zip and 48 tracked files under .trellis/tmp/browser-extension-package-check-extracted/browser-extension/. Following approval and commit, archive task records and record journal in separate bookkeeping commits on main; no push. Do not stage the unchanged portable script or ignored local evidence fixtures.
## Authorized closure

User approved submission and archive. Migration commit 1fc66470 and obsolete snapshot deletion commit 57c828b8 are complete on main. All revised acceptance criteria passed the independent manual cleanup check. Archive uses --skip-branch-validation because this task intentionally stayed on main, never had a PR, and branch/base_branch truthfully both name main. This is the documented non-PR exception, not permission to change branches. Unrelated .trellis/tmp/pr-review-20260911/ is excluded. Portable script has no content diff and is excluded. Historical blocked/unchecked execution entries above are superseded by final acceptance; rejected automatic retention remains out of scope.