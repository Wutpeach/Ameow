# Download Pipeline Review Plan

## Steps

1. Activate the Trellis task after planning artifacts are complete.
2. Inventory download pipeline entrypoints and tests using `fff` tools where possible.
3. Read the browser-extension selection path and verify payload preservation.
4. Read Electron IPC/WebSocket bridge code and verify dispatch ownership.
5. Read runtime command router, queue service, and orchestrator for lifecycle/cancel/terminal semantics.
6. Read executors and process helpers for resource cleanup, progress reporting, dependency resolution, and platform behavior.
7. Read adjacent tests for missing regression coverage.
8. Produce a Chinese review report with prioritized findings and remediation guidance.
9. After user approval, fix the confirmed P1 findings:
   - Preserve Xiaohongshu extension-resolved `videoUrl` and `videoCandidates` through Electron and renderer queueing.
   - Wait for direct-download output stream settlement before returning success.

## Validation

Because this is a read-only code review, validation means evidence collection rather than changing code:

- Use line-numbered reads for cited files.
- Cross-check findings against specs and tests.
- Run targeted static/test commands only if needed to confirm a suspected issue and if they do not require external services.

For the user-approved repair step:

- Run targeted regression tests for the changed download paths.
- Run `npm run type-check`, `npm run lint`, full `npm test`, and `git diff --check`.

## Rollback

No production rollback is expected. Planning artifacts are the only files created for this review task.
