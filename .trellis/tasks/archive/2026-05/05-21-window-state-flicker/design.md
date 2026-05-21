# Window state transition pointer and taskbar stability design

## Architecture

The fix stays within the existing main-window ownership split:

- Electron main owns native BrowserWindow state: focusability, mouse passthrough, taskbar visibility, and pointer-boundary polling.
- Renderer shell state owns compact/full phases and decides when native interaction mode changes are requested.

No new runtime boundary or API is introduced.

## Native Window Contract

`ameow:current-window:set-interaction-mode` must preserve the Windows tray-first invariant in both branches:

- `interactive`: disable mouse passthrough, set focusable, keep the main window off the taskbar, restart pointer-boundary tracking.
- `compact-passthrough`: stop pointer-boundary tracking, enable mouse passthrough, set non-focusable, keep the main window off the taskbar.

The key correction is to call the existing `keepMainWindowOffWindowsTaskbar(win)` after `setFocusable(false)` in the compact branch, matching the backend spec's rule that Windows can re-evaluate taskbar ownership after focusability changes.

Manual Windows validation after that change showed the taskbar flicker still reproduced. The stronger hypothesis is that the repeated native focusability toggle itself is what makes Windows briefly surface the taskbar entry. The design therefore treats focusability as platform-specific:

- Windows compact/full interaction should preserve click-through and pointer forwarding without toggling native focusability in the hot path.
- Non-Windows platforms may continue to use the existing focusability transition if needed for their click-through behavior.

## Pointer Boundary Contract

Pointer-boundary polling should not send a first event from an obsolete start cycle after the controller has already been stopped. The controller can defer the initial emission by one timer tick and cancel that pending first emission during `stop()`.

This keeps the renderer from receiving a boundary event while the shell effect pipeline is still applying the expand transition, without changing the 50 ms recurring polling cadence.

The compact/full collapse latency should not be hidden behind a double RAF settle once focusability toggling has been removed from the hot path. The cleanest response contract is to keep the leave grace short and let the collapse animation begin promptly; the settle handler can still own the final `compact-passthrough` application without waiting an extra frame pair.

## Shell State Contract

The reducer should own shell phase transitions, but not duplicate interaction-mode ownership on collapse. The clean split is:

- expand path: reducer flips to `interactive` before the visual expand begins
- collapse path: reducer only moves the shell into `collapsing` / `compact`, and the settle handler applies `compact-passthrough` once the final compact state is stable

While the renderer shell is `expanding`, a transient `pointerLeave` should update `pointerInside` but should not immediately move the shell to `collapsePending`. The expand animation completion path already checks `pointerInside`; if the pointer is still outside after expansion settles, it can schedule the existing collapse delay then.

This prevents rapid compact-to-full transitions from bouncing into a collapse before the full native bounds have settled.

## Compatibility

- Windows: improves taskbar stability by removing the high-frequency focusability toggle from the interaction path.
- macOS/Linux: `keepMainWindowOffWindowsTaskbar` is already a no-op outside Windows.
- Renderer API: unchanged.
- User-visible behavior: compact icon passthrough and full-window pointer handling should remain the same, with fewer transient failures.

## Rollback

Each adjustment is isolated:

- Revert the compact-branch `keepMainWindowOffWindowsTaskbar` call if it causes unexpected Windows shell behavior.
- Revert the pointer-boundary deferred initial emit if it delays enter detection in a measurable way.
- Revert the `expanding` pointer-leave guard if manual testing shows the window no longer collapses after the pointer leaves during expansion.
