# Restore X and Bilibili injected download buttons while keeping global context menu

## Goal
Restore the injected download buttons for X and Bilibili without regressing the global right-click download menu behavior.

## Requirements
- Restore the X/Twitter site-specific injected download button on supported tweet/post pages.
- Restore the Bilibili player injected controls when the control bar container is present, even if native button shape detection is temporarily incomplete.
- Keep the existing global context menu download flow unchanged so it still works as a site-agnostic fallback.
- Avoid moving per-site routing or download-engine decisions into detector scripts or other extension entrypoints.

## Acceptance Criteria
- [ ] `browser-extension/manifest.json` registers the X/Twitter detector again.
- [ ] Bilibili detector injects controls when a usable player control container exists.
- [ ] Background context-menu handling remains intact and unchanged in behavior.
- [ ] Automated tests cover the restored manifest registration and Bilibili control-bar readiness fallback.

## Technical Notes
- This is an extension-focused fix with cross-layer implications because detector payloads still flow through `background.js` into the desktop runtime.
- The right-click menu is treated as a global capability; injected buttons remain site-specific patches.
