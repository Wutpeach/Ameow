# Refine browser extension toolbar sync indicator

## Goal

Change the browser extension toolbar action sync indicator from the current yellow badge with a black dot glyph into a small solid yellow dot.

User-facing value:

- When the current tab matches a site-session entry, the toolbar indicator should read as a quiet status dot rather than a noisy text badge.
- The indicator should stay compact and recognizable on browser toolbar icons.

## Confirmed Facts

- The current toolbar indicator is implemented in `browser-extension/background.js` by `updateActionBadgeForActiveTab()`.
- It currently uses Chrome action badge text:
  - `chrome.action.setBadgeText({ text: shouldShow ? '•' : '' })`
  - `chrome.action.setBadgeBackgroundColor?.({ color: '#f59e0b' })`
- That produces the observed visual: yellow badge background plus a black dot glyph rendered by the browser.
- The indicator is shown when:
  - the desktop connection is active;
  - the active tab URL matches a site-session registry entry.
- The extension default toolbar icon is declared in `browser-extension/manifest.json`:
  - `icons/icon16.png`
  - `icons/icon48.png`
  - `icons/icon128.png`
- Product design context supports restrained warning/attention color for small status indicators.

## Requirements

- Replace the current text-badge treatment with a small solid yellow circular dot.
- Avoid rendering a black glyph inside the indicator.
- Preserve the existing visibility logic: show only when connected and the active tab matches a site-session entry.
- Preserve the existing action title behavior that explains the matching site-session sync action.
- Keep the change scoped to the browser extension toolbar indicator; do not change in-page floating launcher badges, site-session Settings UI badges, or desktop warning dots.
- Prefer a runtime action icon overlay if needed, because Chrome action badges are text/background based and do not directly support a pure dot shape.
- Keep icon updates resilient:
  - clear any existing badge text when using icon overlay;
  - restore the base action icon when the indicator should hide;
  - catch and warn on Chrome action API errors without breaking background logic.

## Acceptance Criteria

- [x] On matching site-session tabs, the toolbar action shows a small yellow dot, with no black dot/text inside it.
- [x] On non-matching tabs or when disconnected, the toolbar action returns to the normal icon with no indicator.
- [x] Existing title text still changes to `Ameow: sync login state for <site>` when the dot is shown.
- [x] The implementation does not use badge text `•` for the visible indicator.
- [x] Focused extension tests cover show/hide behavior and verify badge text is cleared or unused.
- [x] Browser-extension relevant tests pass.

## Notes

- Candidate files:
  - `browser-extension/background.js`
  - existing or new browser-extension tests around action badge/icon behavior
- Out of scope:
  - Redesigning the toolbar icon itself.
  - Changing site-session registry matching rules.
  - Changing in-page cat button or floating launcher visuals.
