# Browser Extension Toolbar Layout Redesign Implementation Plan

## Preconditions

- Do not run `task.py start` until the user reviews and approves planning.
- Before implementation, load `trellis-before-dev` and the relevant frontend guidelines.
- Keep edits scoped to the browser extension popup unless implementation reveals a required locale update.

## Implementation Steps

1. Update popup structure.
   - Remove persistent context/site title surface from the visible toolbar layout.
   - Keep the media browser as the first visible content area.
   - Move the rescan button from the current context card actions into the media browser toolbar next to the media type segmented control.
   - Move login state markup into compact controls below the media browser.
   - Remove launcher summary from toolbar popup.
   - Remove the `Download current page` fallback button from the toolbar popup.

2. Update popup rendering logic.
   - Remove or redirect every `renderContextCard()` call site so scan progress, empty states, and unavailable states render through the media browser and footer.
   - Remove visible context-card state as the primary scan/connection/launcher feedback channel.
   - Stop rendering normal connected state as persistent header status.
   - Render abnormal desktop status into footer left slot for `connecting` and `offline`.
   - Render settings in footer left slot for normal connected state.
   - Preserve settings/help access when footer left shows abnormal desktop status.
   - Keep version centered and more menu on the right.
   - Keep login state row always present and compute disabled/unavailable copy when sync is not applicable.
   - Remove or guard all `contextFallbackDownloadButton` references, including static copy, visibility changes, and click listeners.
   - Remove toolbar launcher status rendering, launcher hidden-site rendering, launcher startup refresh, and `launcherTimer` interval if no remaining visible state requires them.

3. Update popup styles.
   - Replace prominent login state card styling with compact row styling.
   - Keep stable dimensions for login row in all states.
   - Tighten footer without disturbing centered version alignment.
   - Preserve black and white theme tokens.
   - Ensure media browser has the largest share of popup vertical space.

4. Update locale strings if needed.
   - Add or revise short labels for login state unavailable/offline/synced states.
   - Add accessible copy for rescan current page media if existing copy is insufficient.
   - Avoid verbose toolbar text.

5. Validate behavior.
   - Media scan opens directly and displays scanning/empty/list states.
   - Rescan still triggers current page media scan.
   - Quality setting persists.
   - Login sync flow still works and disabled state is stable.
   - Settings and more menu still open.
   - Offline/connecting footer state does not break version centering.
   - Removed DOM elements do not leave null-reference crashes in popup startup or event binding.

## Validation Commands

- `npm run lint`
- `npm run type-check`
- Browser extension popup smoke check in Chrome/Edge if practical.

## Risk Points

- Removing the context card may break code paths that assume context elements always exist.
- `renderContextCard()` currently has multiple call sites across status, launcher, scan, and media rendering.
- `contextFallbackDownloadButton` currently has lookup, copy, visibility, and click-handler dependencies.
- Launcher status polling can remain as a silent wasted interval if only visible launcher markup is removed.
- Moving login state from hidden conditional panel to always-present row requires careful state copy.
- Footer-left abnormal status must not obscure access to settings permanently.
- Locale copy must stay short enough for the compact row layout in English and Chinese.

## Rollback Points

- Revert popup structure changes if context-card assumptions are too tightly coupled.
- Keep existing media browser and quality rendering functions unchanged where possible.
- If abnormal footer status becomes too crowded, fall back to normal settings footer plus inline abnormal status above compact controls.
