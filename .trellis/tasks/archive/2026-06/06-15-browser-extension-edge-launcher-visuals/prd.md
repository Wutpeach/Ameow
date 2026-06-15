# Optimize browser extension edge launcher visuals

## Goal

Improve the browser extension edge launcher so the docked Ameow mascot remains legible on dark pages/themes and no longer shows a persistent green connected-state outline that looks like an unintended hint.

## Requirements

- Remove the persistent green outline/border from the launcher handle when the extension is connected to the desktop app.
- Keep the launcher handle's existing docked half-pill behavior, side positioning, hover reveal, drag behavior, and action buttons.
- Add a low-contrast circular visual backing behind the mascot icon inside the launcher handle so the dark mascot remains distinguishable without reading as a bright sticker in the black theme.
- Keep interaction feedback aligned with Ameow's design language:
  - neutral border for default/connected
  - blue accent for hover, connecting, picker/drag attention, and drag glow
  - danger tone only for offline/error states when useful
- Support both `black` and `white` launcher themes without introducing a new theme name or a large palette shift.
- Avoid changing browser extension feature behavior, download actions, launcher configuration storage, or supported-site injection behavior.

## Acceptance Criteria

- [x] In the connected state, the launcher handle does not use a green border or green outline.
- [x] The mascot icon is rendered on a low-contrast circular backing that improves separation in the black theme without becoming visually dominant.
- [x] The launcher remains visually consistent with the existing docked half-pill shape on both left and right screen edges.
- [x] Hover and drag states still provide clear blue-accent feedback.
- [x] Existing launcher actions and quality flyout remain positioned and usable.
- [x] The change is limited to the browser extension launcher visual surface unless implementation reveals a minimal DOM wrapper is required.

## Notes

- Confirmed code references:
  - `browser-extension/floating-launcher.js` creates the shadow-root launcher and mascot image.
  - `browser-extension/floating-launcher.css` owns the handle, connection state, mascot sizing, and theme tokens.
  - `browser-extension/mascot.svg` is the current handle icon asset.
- Approved design direction:
  - keep the outer docked half-pill as the main launcher affordance
  - place the mascot on a small low-contrast circular badge/backing inside the handle
  - remove connected-state green as a persistent outline
