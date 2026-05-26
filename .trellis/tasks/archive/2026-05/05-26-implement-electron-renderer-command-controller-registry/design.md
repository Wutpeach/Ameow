# Design

## Current `handleCommand(...)` Dispatch Order

Current order in `electron/main.mts`:

1. `getVideoDownloadCommandBridge()`
   - If `supports(command)` is true, return `invoke(command, payload)`.
2. `getSiteSessionCommandController()`
   - If `supports(command)` is true, return `invoke(command, payload)`.
3. `getSupportLogCommandController()`
   - If `supports(command)` is true, return `invoke(command, payload)`.
4. Existing `switch (command)`.
5. Existing default error:
   - `Unsupported Electron command: <command>`

Fallback to the switch currently begins immediately after the support-log controller guard. Phase 5.3 must keep the switch in that same fallback position after the registry loop.

## Implementation Shape

Default implementation:

- Keep the registry inline in `electron/main.mts`.
- Define an ordered array of lazy getter functions:
  - `getVideoDownloadCommandBridge`
  - `getSiteSessionCommandController`
  - `getSupportLogCommandController`
- Add the short load-bearing comment:
  - `Order matters: first supporting controller wins.`
- In `handleCommand(...)`, loop through the getters, call each getter lazily, check `supports(command)`, and invoke the first supporting controller.
- If no controller supports the command, continue to the existing switch unchanged.

## Testability

If inline dispatch cannot be characterized without brittle `electron/main.mts` lifecycle imports, add a tiny pure helper:

- `electron/rendererCommandControllerRegistry.mts`
- `electron/rendererCommandControllerRegistry.test.mts`

The helper must not own Electron dependencies or instantiate controllers. It may only dispatch over injected controller instances/getters and return a hit/miss result that lets `main.mts` preserve switch fallback and unknown command behavior.

## Compatibility

- No command names change.
- No payload data or payload object identity changes.
- No return values change.
- No errors are caught or wrapped.
- Unknown command fallback remains the switch default.
- Lazy initialization remains because registry entries are getter functions.
- `main.mts` remains the composition root.

## Risk

Risk is low to medium. The code change is small, but `handleCommand(...)` is central renderer command routing, so characterization tests should lock down order, first-match behavior, fallback, payload identity, error identity, and unknown command text.

## Completion Summary

Status: completed.

Implemented Phase 5.3 only. Added a minimal renderer command controller registry for the three already controllerized command families while keeping `electron/main.mts` as the composition root.

Files changed:

- `electron/main.mts`
- `electron/rendererCommandControllerRegistry.mts`
- `electron/rendererCommandControllerRegistry.test.mts`

Registry order:

1. video download via `getVideoDownloadCommandBridge`
2. site session via `getSiteSessionCommandController`
3. support log via `getSupportLogCommandController`
4. existing `switch (command)` fallback

Behavior preserved:

- Renderer command names unchanged.
- Payload values and object identity preserved when a controller handles a command.
- Controller return values preserved.
- Controller and getter errors pass through without catch/rewrap.
- Unknown command text remains `Unsupported Electron command: <command>` through the existing switch default.
- Lazy initialization remains because registry entries are getter functions, not controller instances.
- `main.mts` still owns controller construction and dependency injection.
- Remaining switch command families were not extracted.
- WebSocket actions, BrowserWindow, startup/lifecycle, renderer/preload/desktop bridge types, and command envelopes were not changed.

Tests added:

- Registry checks controller getters in declared order.
- First supporting controller wins.
- Unsupported commands return an unhandled result for switch fallback.
- `get_config` is not consumed by controllers.
- Payload object identity is passed to the invoked controller.
- Controller rejection identity passes through.
- Getter throw identity passes through.
- Unknown command miss lets the caller preserve `Unsupported Electron command: <command>`.

Validation:

- `npm test -- electron/videoDownloadCommands.test.mts electron/siteSessionCommands.test.mts electron/supportLogCommands.test.mts electron/rendererCommandControllerRegistry.test.mts`: passed, 4 files / 33 tests.
- `npm run type-check`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 115 files / 732 tests.
- `git diff --check`: passed with only Windows LF-to-CRLF working-copy warning.

Claude plan review:

- No must-fix issues.
- Confirmed tiny pure helper is justified for testability and avoids importing `electron/main.mts` lifecycle side effects.
- Confirmed lazy getter registry preserves dispatch order, fallback, lazy init, and ESM safety.
- Recommended typed discriminated union, module-scope getter array after getter declarations, and getter-throw passthrough test; all adopted.

Claude final diff review:

- No must-fix issues.
- Confirmed no behavior change in order/fallback/lazy init/return/error behavior.
- Confirmed no ESM initialization risk.
- Confirmed tests are sufficient and scope is clean.

Commit:

- `2849442 refactor(electron): add renderer command controller registry`

Follow-up:

- None for Phase 5.3. Future Phase 5.x work should be planned separately and must not infer permission to extract remaining switch families from this registry.
