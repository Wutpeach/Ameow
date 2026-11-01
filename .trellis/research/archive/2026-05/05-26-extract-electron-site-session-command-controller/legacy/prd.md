# Extract Electron site-session command controller

## Goal

Extract the site-session renderer command dispatch family from `electron/main.mts` into a focused Electron main-process controller, `electron/siteSessionCommands.mts`, while preserving command names, payload behavior, error behavior, and site-session manager call semantics.

## Scope

- Add `electron/siteSessionCommands.mts`.
- Add `electron/siteSessionCommands.test.mts`.
- Modify `electron/main.mts` only enough to delegate site-session renderer commands to the new controller.
- Cover the full site-session command family:
  - `get_site_session_state`
  - `start_site_session_capture`
  - `complete_site_session_capture`
  - `cancel_site_session_capture`
  - `clear_site_session`
  - `get_douyin_session_state`
  - `start_douyin_session_capture`
  - `complete_douyin_session_capture`
  - `cancel_douyin_session_capture`
  - `clear_douyin_session`

## Requirements

- Preserve all existing renderer command names and payload formats.
- Preserve current unsupported site-session error text: `Unsupported site session: <siteId>`.
- Preserve current unsupported Electron command error text for this dispatch layer: `Unsupported Electron command: <command>`.
- Preserve generic command site-id resolution behavior, including fallback to `"douyin"` when `payload.siteId` is absent.
- Preserve legacy Douyin alias behavior: hard-code `"douyin"` and ignore `payload.siteId`.
- Preserve manager method return values and promise rejection behavior without catch/rewrap.
- Reuse or move the existing site-id resolver logic; do not create a second divergent implementation.
- Keep `electron/main.mts` as the composition root. The new controller receives dependencies via injection.

## Acceptance Criteria

- [ ] `electron/siteSessionCommands.mts` exposes a `supports()` / `invoke()` controller or equivalent local pattern.
- [ ] `electron/main.mts` delegates site-session commands through the controller while retaining all non-site-session command behavior.
- [ ] New characterization tests cover:
  - every command maps to the correct manager method
  - Douyin aliases map to `"douyin"` and ignore payload site id
  - unknown/non-site commands are not supported
  - manager-missing/unsupported-site error text is preserved
  - generic site-id fallback to `"douyin"` is preserved
  - manager promise rejection passes through without wrapping
- [ ] `npm test -- electron/siteSessionCommands.test.mts electron/siteSessionManager.test.mts` passes.
- [ ] `npm run type-check`, `npm run lint`, `npm test`, and `git diff --check` pass.
- [ ] Claude plan review and final diff review are completed; concrete in-scope feedback is addressed.
- [ ] The child task is archived and business code is committed separately from Trellis metadata.

## Non-Goals

- Do not modify WebSocket action router or WebSocket lifecycle.
- Do not modify BrowserWindow creation or site-session capture window creation.
- Do not modify app startup, shutdown, or lifecycle flow.
- Do not modify download queue or download command bridge.
- Do not modify config save/proxy/broadcast behavior.
- Do not modify renderer command names, payload formats, or renderer/preload contracts.
- Do not catch or rewrap errors unless matching existing behavior.
- Do not do unrelated `main.mts` cleanup.
- Do not run broad formatting that creates unrelated diffs.
- Do not enter Phase 5.2.
