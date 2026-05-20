# Professional full-project code review and fixes

## Plan

1. Preserve `extensionData` in `video_selected_v2` queue payload construction.
2. Add focused test coverage for the preserved metadata.
3. Refactor dropped-file fallback handling in `src/App.tsx` to remove duplicate hand-written base64 conversion and cap oversized pathless files.
4. Run focused tests, then project type-check and lint.
5. Update specs if the fix reveals a durable cross-layer contract worth recording.

## Work Checklist

- [x] Read task-relevant specs and repository docs.
- [x] Inspect key entry points and high-risk modules in `src/`.
- [x] Inspect key entry points and high-risk modules in `electron/`.
- [x] Inspect key entry points and high-risk modules in `browser-extension/`.
- [x] Inspect task-relevant scripts and configs.
- [x] Draft and deliver review findings.
- [x] Update `electron/videoDownloadCommands.mts`.
- [x] Update `electron/videoDownloadCommands.test.mts`.
- [x] Update `src/App.tsx` dropped-file fallback.
- [x] Run validation commands.

## Validation

- `npm test -- electron/videoDownloadCommands.test.mts`
- `npm run type-check`
- `npm run lint`

## Risky Areas To Inspect First

- download orchestration and engine/runtime routing
- Electron main/preload event and window-state flows
- browser-extension background/content integration
- scripts that mutate packaging/runtime assumptions
- shared contracts crossing `src/`, `electron/`, and extension boundaries

## Rollback

- Revert the small changes to `electron/videoDownloadCommands.mts`, `electron/videoDownloadCommands.test.mts`, and `src/App.tsx` if focused validation reveals unacceptable behavior.
