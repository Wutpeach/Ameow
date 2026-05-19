# Implementation Plan

## Checklist

1. Load backend development guidelines before editing.
2. Update `electron/main.mts` `video_selected_v2` forwarding payload to include `clipStartSec` and `clipEndSec`.
3. Update `electron/videoDownloadCommands.mts` debug summary to include clip range fields.
4. Add or update focused tests proving the bridge preserves clip fields.
5. Run targeted tests:
   - `npm test -- electron/videoDownloadCommands.test.mts src/electron-runtime/ytDlpCommandPlan.test.ts src/electron-runtime/ytDlpDownload.test.ts src/sites/providers.test.ts`
6. Run type-check if edits touch typed Electron files:
   - `npm run type-check`

## Risk Points

- `electron/main.mts` manually reconstructs the queue payload; missing any future field can repeat this bug.
- Tests should assert the exact queued payload, not only a successful ack.

## Rollback

Revert edits in `electron/main.mts`, `electron/videoDownloadCommands.mts`, and associated tests.
