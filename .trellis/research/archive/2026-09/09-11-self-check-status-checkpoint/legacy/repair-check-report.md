# Independent bounded repair review

Verdict: **PASS after a test-only REPAIR**. Both authorized projection omissions are resolved. No additional production edits were needed; no commits, metadata/spec changes, authority changes, or P2-B work were performed.

Task: `.trellis/tasks/09-11-self-check-status-checkpoint`
Orca Task: `task_f04743519b29`
Dispatch: `ctx_9f2690abcb35`

## Findings (fixed)

- `electron/errorDiagnosticCopy.test.mts`: implementation coverage did not directly prove rejection of invalid runtime candidates or preservation-and-redaction of runtimeSetId at normalization. Added one existing-suite test covering unknown/secret-bearing strings, object, array, number, and null candidates, plus non-string runtimeSetId. It checks the normalized typed request, projected report, and formatted text. Extended the existing structured privacy test to require `runtime-set-token=[REDACTED]` before building and to reject the secret in report text.
- This reviewer changed only that existing test file and task-local report/logs. The implementation worker's production and command-test edits were preserved.

## Actual path and contract review

- `src/application/download-job-service.ts` supplies inspected attempt runtime facts to `recordAttemptRuntime`; `src/application/download-diagnostics.ts` stores the existing optional `runtimeCandidate?: "bundled"` and `runtimeSetId?: string` on ordered attempt snapshots and terminal summaries. No additional candidate literal is currently part of this type.
- `src/protocol/download/ipcMappers.ts::toDownloadResultPayload` passes `outcome.diagnosticSummary` as `failure.attemptSummary`, choosing diagnostic classification/category from structured facts and omitting raw process output. The report repair consumes that existing type without changing it.
- All production callers of the changed normalizer/builder were searched with fff. `electron/errorDiagnosticCommands.mts` calls the same normalizer once and text builder once before choosing clipboard versus save. It remains the production consumer; both sinks receive identical text for fixed inputs/time, including both runtime fields.
- The normalizer accepts only the current exact `bundled` literal and calls the existing `normalizeSafeString` for runtimeSetId (trim/type check, shared `sanitizeDiagnosticText`, 160-character cap). The existing final `sanitizeDiagnosticValue` remains in place. Invalid candidate inputs are absent in both the normalized typed/report surface and text. No new parser, sanitizer, schema, dependency, or speculative future-candidate handling was introduced.
- The formatter now conditions `[attempts]` on nonempty attempts and `[terminal]` on a supplied summary. Valid zero-attempt terminal facts print with `attemptCount=0`; absent summaries remain absent. Existing normalizer trace/status validation is unchanged.
- No runtime/log reader, raw-stderr classification, selection, execution, active-lease, repair, or Diagnostics mutation path was added. Raw Download text remains non-authoritative; bounded Transcode evidence and privacy behavior remain covered.

## Findings (not fixed)

No outstanding in-scope code issue. A pre-existing documentation mismatch was encountered: `.trellis/spec/backend/quality-guidelines.md` still describes Rust/Tauri patterns, while its parent index describes Electron. This is outside the authorized source/test repair and was left unchanged; the current logging and runtime contract leaves supplied the applicable ownership requirements.

## Spec assessment

Existing `.trellis/spec/backend/logging-guidelines.md` already covers allowlist-first projection, the shared sanitizer, read-only Diagnostics, structured facts and sparse failures, ordered terminal/attempt facts, one normalizer/builder for Copy/Save, and exclusion of raw Download/session-log evidence. The runtime and preload contract leaves keep execution and bridge ownership separate. This patch restores supplied facts within that unchanged contract; it needs no new schema, ownership rule, or roadmap/spec edit.

## Verification

Commands ran from `D:\Ameow`; all Vitest invocations exclude `.trellis/**` and `.cindy-worktrees/**`.

```powershell
npx vitest run electron/errorDiagnosticCopy.test.mts electron/errorDiagnosticCommands.test.mts src/application/download-diagnostics.test.ts src/protocol/download/ipcMappers.test.ts src/utils/errorDiagnosticCategories.test.ts src/core/diagnostics/safe-diagnostic.test.ts --exclude '.trellis/**' --exclude '.cindy-worktrees/**'
```

PASS: **6 files, 115 tests** (743 ms). Related suites cover the Application recorder/terminal source, IPC mapping, typed category precedence, and the shared privacy helper; no broader runtime/Diagnostics or P2-B suites were needed. Output: `repair-check-tests.log`.

```powershell
npm run type-check
npm run lint
git diff --check
```

All PASS, exit 0. Type-check runs `tsc --noEmit && tsc -p tsconfig.electron.json --noEmit`. Repository lint runs `eslint src vite.config.ts --ext .ts,.tsx`; its configured scope does not include Electron test files, which are covered by TypeScript and Vitest. Outputs: `repair-check-types.log`, `repair-check-lint.log`.

### Original-omission negative control

Used Python from PowerShell (`@' ... '@ | python -`) to save `electron/errorDiagnosticCopy.mts` bytes, temporarily write `subprocess.check_output(['git', 'show', 'HEAD:electron/errorDiagnosticCopy.mts'])`, run this exact argv via `subprocess.run` with captured output, and restore the saved bytes in `finally`, asserting byte-for-byte restoration:

```text
npx.cmd vitest run electron/errorDiagnosticCopy.test.mts electron/errorDiagnosticCommands.test.mts --exclude .trellis/** --exclude .cindy-worktrees/**
```

Expected failure confirmed: **2 files failed; 4 failed, 11 passed (15 total)**. Failures identify missing runtimeCandidate in rich report and shared command text, missing zero-attempt `[terminal]`, and dropped normalized runtimeSetId. Full captured output: `repair-check-original-regression.log`.

The wrapper's attempt to echo the Unicode Vitest output hit the local Python GBK console encoding error after the complete output had been saved. Its `finally` still restored and checked the source byte-for-byte; the persisted log was read directly to verify the four expected failures. This was a console-display issue, not a source/test failure left behind.

After restoration, ran:

```powershell
npx vitest run electron/errorDiagnosticCopy.test.mts electron/errorDiagnosticCommands.test.mts --exclude '.trellis/**' --exclude '.cindy-worktrees/**'
```

PASS: **2 files, 15 tests** (605 ms), output `repair-check-restored-tests.log`. Type-check and lint ran against the restored repaired source. Final diff review confirms only the authorized production repair remains; unrelated `.codex/agents/trellis-check.toml`, `.trellis/tmp/`, and checkpoint evidence were preserved.
