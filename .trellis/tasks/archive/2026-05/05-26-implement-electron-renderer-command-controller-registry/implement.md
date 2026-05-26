# Implement Plan

## Steps

- [ ] Confirm pre-edit `handleCommand(...)` dispatch order and switch fallback location.
- [ ] Load applicable backend Electron specs and planning task guidance.
- [ ] Claude plan review before editing.
- [ ] Add registry characterization coverage.
- [ ] Implement inline ordered lazy getter registry in `electron/main.mts`.
- [ ] Keep existing switch cases unchanged.
- [ ] Run focused tests:
  - `npm test -- electron/videoDownloadCommands.test.mts electron/siteSessionCommands.test.mts electron/supportLogCommands.test.mts electron/rendererCommandControllerRegistry.test.mts`
- [ ] Run full validation:
  - `npm run type-check`
  - `npm run lint`
  - `npm test`
  - `git diff --check`
- [ ] Claude final diff review and address reasonable feedback.
- [ ] Re-run required checks after any feedback changes.
- [ ] Commit business change as `refactor(electron): add renderer command controller registry`.
- [ ] Archive task and record journal as separate chore commits.

## Guardrails

- Do not extract remaining switch families.
- Do not modify renderer/preload/desktop bridge types.
- Do not change WebSocket actions or startup/lifecycle behavior.
- Do not change BrowserWindow behavior.
- Do not change command names, payloads, returns, error envelopes, or unknown command text.
- Do not alter lazy initialization by constructing controller instances eagerly.
- Do not introduce hidden global mutable state.

## Required Test Coverage

- Registry dispatch order.
- First-match wins.
- Fallback to switch when no controller supports a command.
- `get_config` is not consumed by controllers.
- Payload identity is passed to the invoked controller.
- Controller rejection error identity passes through.
- Unknown command text remains unchanged.
- Existing video download, site-session, and support-log controller tests still pass.
