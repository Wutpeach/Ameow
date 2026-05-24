# Refine extension popup chrome layout

## Goal

Further simplify the browser-extension popup chrome after the options-page redesign. Remove the redundant top brand strip, integrate connection status and refresh into the working content area, and align the footer actions so Settings and More feel visually balanced.

The popup should continue to behave as a compact current-page media/download console. This task is a layout and visual hierarchy refinement, not a new feature surface.

## User Value

- The popup opens directly into the current-page workflow instead of spending vertical space on brand chrome.
- Connection and scan refresh controls remain available but do not dominate the first row.
- The footer looks intentionally balanced, with Settings and More sharing the same edge alignment and button rhythm.
- The popup becomes shorter and easier to scan without changing the media browser behavior.

## Confirmed Facts

- Current popup files are `browser-extension/popup.html`, `browser-extension/popup.css`, and `browser-extension/popup.js`.
- The previous task moved persistent launcher and hidden-site management into `browser-extension/options.html`.
- Current top header contains:
  - `.ameow-popup-logo` cat icon;
  - `.ameow-popup-title` (`Ameow`);
  - `.ameow-popup-subtitle` (`Extension`);
  - `.ameow-header-status` status pill.
- Current page context row already contains the active page title/status plus `Refresh` and fallback download action.
- Current footer uses a three-column grid with Settings, version, and More. The Settings button includes an icon and text, while More uses `...` and text; this creates uneven optical width and edge alignment.
- Product design context favors compact floating surfaces, minimal chrome, restrained accent use, and familiar product UI controls.

## Proposed Layout Direction

Use this as the preferred implementation plan unless review changes it:

```text
Context row:
  [host/title]
  [scan/launcher/status copy]
  right side: [connection dot+label] [refresh icon button]

Media browser:
  Video / Audio / Image tabs
  summary
  list / empty state

Compact controls:
  Quality
  Launcher summary

Footer:
  [Settings]          [v0.3.0]          [More]
```

### Header Removal

Remove the visible `.ameow-popup-header` brand strip from the popup:

- remove the cat icon from the first viewport;
- remove visible `Ameow`;
- remove visible `Extension`;
- keep `document.title` and localization keys if other contexts still use them.

The extension already has browser chrome and the footer version; repeating brand text in a 344px popup is lower value than page/media controls.

### Status And Refresh Integration

Move connection status into the context row as a compact inline badge:

- use a dot plus short label (`Connected`, `Connecting`, `Offline`);
- keep tooltip/hint semantics from the current status copy;
- preserve status color behavior;
- keep the status visually secondary to the active page title.

Make refresh a compact icon button or icon+micro-label in the context action area:

- recommended: circular or square 28-30px icon button with aria-label and title;
- when scanning, show a compact disabled/loading state without expanding the row text;
- avoid a wide `Refresh` text button unless fallback download also appears and needs text balance.

### Footer Alignment

Adjust the footer so left and right controls are optically symmetrical:

- equal-width left and right footer button slots;
- same button height, padding, border radius, and hover/focus treatment;
- Settings and More should align to the same outer inset;
- either both use icon+text or both use text-first compact treatment;
- keep version centered and stable.

Recommended footer pattern:

```text
grid-template-columns: 1fr auto 1fr
left slot:  justify-self: start; fixed/min width
version:    justify-self: center
right slot: justify-self: end; fixed/min width
```

## Requirements

- Remove visible cat icon, `Ameow`, and `Extension` from the popup top area.
- Do not remove app identity from `document.title`, manifest, options page, or external docs links.
- Keep current connection status behavior and translations, but render the status inside the page context or media toolbar area.
- Keep refresh behavior exactly equivalent to current `scanPageMedia()` flow.
- Refresh control must not increase width or height when switching between idle and scanning states.
- Preserve fallback `Download this page` behavior for cases where launcher fallback is available.
- Keep media tabs, candidate rows, row menus, quality controls, launcher summary, Settings, version, and More behavior intact.
- Fix footer visual alignment so Settings and More feel symmetrical at popup edges.
- More menu remains external/help only.
- Avoid body-level scrollbars or popup width jumps.
- Keep black/white theme behavior.
- Keep all new interactive controls accessible with `title`/`aria-label` where visible text is removed.

## Acceptance Criteria

- [x] Popup no longer renders the visible cat icon, `Ameow`, or `Extension` brand strip.
- [x] Connection status is still visible in a compact location outside the removed header.
- [x] Connection status still updates for connected, connecting, and offline states.
- [x] Refresh still triggers media scanning.
- [x] Refresh idle/scanning state does not resize the context row.
- [x] Fallback `Download this page` remains available under the same conditions as before.
- [x] Footer Settings and More are visually balanced, with matching outer alignment and button rhythm.
- [x] Footer More menu still opens as an overlay and contains only GitHub repository and Getting Started.
- [x] Popup layout remains stable without body-level scrollbar width jumps.
- [x] `node --check browser-extension\popup.js` passes.
- [x] Targeted browser-extension tests affected by popup/manifest still pass if applicable.
- [x] `npm run package:browser-extension` includes the updated popup files.

## Out Of Scope

- Moving hidden-site management back into popup.
- Changing options-page launcher settings behavior.
- Changing media candidate scan contracts or background messages.
- Adding a new More menu item.
- Redesigning the full media browser or quality selector.

## Confirmed Product Decision

Connection status should live in the context row next to refresh. The connection status describes whether downloads can be handed to the desktop app, while the context row already describes page readiness and launcher state. Putting it in the media toolbar would make it compete with media type selection.

## Implementation Notes

- Removed the visible popup brand header and its unused CSS/JS references.
- Moved the connection status badge into the context action row.
- Converted Refresh into a fixed-size icon button with screen-reader text, title, and aria-label updates for idle/scanning states.
- Kept the fallback `Download this page` button in the context action row under the same JS visibility conditions.
- Added footer slots so Settings and More use matching edge alignment and minimum button width while the version remains centered.

## Validation Results

- `node --check browser-extension\popup.js` passed.
- `npx vitest run browser-extension/manifest.test.js browser-extension/launcher-config.test.js` passed, 8 tests.
- `npm run type-check` passed.
- `npm run lint` passed.
- `npm run package:browser-extension` passed.
- Packaged zip includes `browser-extension/popup.html`, `browser-extension/popup.css`, and `browser-extension/popup.js`.
