# Implement Electron renderer command controller registry

## Goal

Implement Phase 5.3 of `architecture-boundary-refactor`: replace the three repeated renderer command controller guard blocks in `electron/main.mts` with an ordered lazy getter registry while preserving all current behavior.

## Requirements

- Registry contains only the existing controllerized renderer command handlers:
  1. video download
  2. site session
  3. support log
- Keep `electron/main.mts` as the composition root and owner of controller creation/dependency injection.
- Preserve the current fallback from controller checks into the existing `switch (command)`.
- Preserve renderer command names, payloads, payload object identity, return values, error identity pass-through, and exact unknown command text.
- Preserve lazy initialization by storing getter functions, not controller instances.
- Add the short implementation comment: `Order matters: first supporting controller wins.`
- Do not extract remaining switch families or start Phase 5.4.

## Out Of Scope

- Do not modify WebSocket actions.
- Do not modify BrowserWindow, startup, lifecycle, download, config, file, or path business logic.
- Do not modify renderer command, preload, or desktop bridge type definitions.
- Do not modify command names, payload schemas, return values, error envelopes, or unknown command text.
- Do not introduce hidden global state.
- Do not run broad formatting that creates unrelated diffs.

## Acceptance Criteria

- [ ] Implementation records the existing dispatch order before editing.
- [ ] Claude reviews the implementation plan before code changes.
- [ ] `electron/main.mts` dispatches through an ordered lazy getter registry.
- [ ] Registry order is video download, site session, support log.
- [ ] First supporting controller wins.
- [ ] Non-matching commands continue to the existing switch.
- [ ] `get_config` and other switch commands are not consumed by controllers.
- [ ] Payload identity is preserved when invoking a controller.
- [ ] Controller rejection identity is preserved.
- [ ] Unknown command text remains `Unsupported Electron command: <command>`.
- [ ] Existing controller tests still pass.
- [ ] New registry characterization tests are added unless a clear reason is recorded.
- [ ] Full validation passes: focused tests, `npm run type-check`, `npm run lint`, `npm test`, and `git diff --check`.
- [ ] Claude reviews the final diff and reasonable feedback is addressed.
