# Design System

> Visual language and UI system rules for FlowSelect core surfaces.

---

## Purpose

This document defines the design language for FlowSelect's core UI:

- Main floating window (`200x200`)
- Settings window
- Context menu
- Browser extension popup
- Browser-injected controls and screenshot panels

The goal is not visual reinvention. The goal is to preserve the existing compact, tactile, gradient-based look while making it more consistent, readable, and reusable.

Persistent UI guidance for this repository should live in Trellis frontend specs like this one, not in parallel assistant-specific context files.

---

## Visual Direction

FlowSelect should feel:

- Compact and intentional
- Slightly polished, not flashy
- Utility-first with a soft neon accent
- Dense but still readable

Keep these existing qualities:

- Layered dark/light gradients instead of flat fills
- Soft blue accent for active or selected states
- Minimal chrome around small floating surfaces
- Small, deliberate motion

Avoid:

- Introducing a new aesthetic direction
- Flattening everything into generic gray controls
- Turning every control into a loud "primary" surface
- Spreading raw hard-coded blues/reds/grays across page files

---

## Tokens

`src/contexts/ThemeContext.tsx` is the semantic token source for core UI work.

### Use semantic tokens first

- Accent states: `accentSolid`, `accentText`, `accentSurface`, `accentSurfaceStrong`, `accentBorder`, `accentGlow`
- Danger states: `dangerSolid`, `dangerText`, `dangerSurface`, `dangerBorder`, `dangerGlow`
- Field states: `fieldBg`, `fieldHoverBg`, `fieldInset`, `fieldBorder`, `fieldBorderStrong`
- Utility controls: `controlMuted`, `controlMutedHover`, `controlStroke`, `controlStrokeHover`
- Surfaces: `bgPrimary`, `bgSecondary`, `bgGradientStart`, `bgGradientEnd`, `panelShadow`, `panelShadowStrong`

### Token rules

- Page-level UI should consume semantic tokens, not raw hex values.
- If a value represents a reusable meaning, add a token before reusing the literal.
- Keep primitive color choices inside `ThemeContext`; do not duplicate them in page components.
- Treat `ThemeContext` as the source of truth and mirror semantic tokens to CSS variables for global CSS hooks such as scrollbars, root text color, and browser-level surfaces.
- Global CSS may define safe fallback values in `:root`, but runtime theme changes must flow from `ThemeContext`, not from page-local class toggles.

---

## Component Patterns

### Section shells

- Repeated settings or utility groups should use a shared section shell pattern instead of page-local label/margin recipes.
- A section shell includes:
  - small secondary title
  - optional concise helper copy
  - consistent vertical spacing between controls
- Use section shells to keep dense settings layouts readable without inventing new card styles for each group.

### Buttons

- `default`: reserved for confirm/commit actions
- `outline`: selected or emphasized secondary action
- `ghost`: cancel, quiet, or supporting action

Rules:

- Use soft inset highlights, not harsh elevation
- Use accent variants only when meaningfully selected or primary
- Do not make all actions visually equal

### Toggles

- Toggle track should use semantic field colors when off and accent color when on
- Thumb motion should use `transform`, not positional layout animation
- Always expose `role="switch"` and `aria-checked`

### Inputs and pickers

- Inputs, picker buttons, and dropdown triggers should share one field surface recipe
- Field surfaces use the same radius, gradient background, border, and inset highlight
- Focus/active states should strengthen border and accent, not redraw the entire component

### Field action rows

- File/folder pickers, shortcut record triggers, and similar "button that looks like a field" controls should reuse one shared field-action pattern.
- A field-action row should:
  - use the field surface recipe
  - keep text left-aligned
  - support optional leading icon and compact trailing affordance
  - truncate long values instead of expanding layout
- Do not duplicate these styles as page-local objects when the interaction meaning is the same.

### Inline hint text

- Secondary guidance, preview labels, and status helper copy should use one compact hint pattern.
- Default hint text stays secondary and quiet.
- Accent or danger hint tones may be used for live update/error emphasis, but should remain lighter than primary content.
- Avoid mixing several ad-hoc font-size/opacity combinations for similar helper text.

### Small utility controls

- Window chrome controls use muted tokens by default
- Hover can brighten or turn danger-red, but should stay visually lightweight
- These controls should never dominate the panel

### Window shells and compact notices

- Settings, UI lab, and similar desktop child windows should share one outer shell recipe instead of re-declaring border, inset shadow, clip path, and padding rules per page.
- Prefer shared helpers from `src/components/ui/shared-styles.ts` for:
  - window shell
  - window header/body/footer spacing
  - drag/no-drag region metadata
  - compact inline notice surfaces
- Transparent desktop windows should keep page chrome simple: one shell, one header divider, one scrollable body, one footer if needed.
- Do not create page-local variants for the same shell structure unless the window meaningfully differs in interaction or density.

### Dense utility cards

- Repeated settings cards such as downloader/runtime status blocks should use one shared content layout for:
  - version/meta row
  - helper/description text
  - optional progress surface
  - status line
  - action row
- Keep the card shell and content layout separate so motion containers can animate cards without each page redefining the internal spacing contract.

---

## Page Patterns

### Main floating window

- Maintain a single dominant center state
- Keep corner controls visually quiet unless hovered
- Accent glow should support active drag/download states, not become a permanent decoration
- Queue/status badges may be more vivid than chrome controls because they communicate live state

### Settings window

- Group by task, not by arbitrary visual blocks
- Section labels are small and secondary; control content carries the emphasis
- Repeated control types must share spacing, radius, border treatment, and active styling
- Dense layout is acceptable, but hierarchy must remain obvious in 2 seconds
- When a rounded settings shell fills a transparent child window, prefer borders and `inset` shadows on the outermost shell; avoid outer drop shadows that can leak as square corners on macOS.

### Context menu

- Extremely compact, no ornamental complexity
- Hover feedback should feel related to the main surfaces
- Borders and shadows should be subtle and clean

### Browser extension popup

- Should feel like a companion surface to the desktop app, not a separate product
- Prefer compact panel language over decorative popup chrome
- The toolbar popup is a media-first quick panel: open directly into current-page `Video / Audio / Image` browsing instead of a landing card or nested feature launcher
- Keep only current-page shortcuts in the toolbar. Download quality and site login-state sync may live below the media browser; launcher visibility, hidden sites, and broader configuration belong in the extension settings page
- Normal connected state should stay implicit. Show desktop connection status only for abnormal states such as connecting/offline, and keep the centered footer version stable
- Do not add a `Download current page` toolbar action when the in-page launcher/floating window already owns the primary download path

### Browser-injected controls

- Stay lightweight and site-aware, but still use consistent FlowSelect interaction states
- Site accents may vary, but button states, motion, and panel treatment should remain recognizably related
- Reuse screenshot-panel and overlay button patterns across supported sites instead of restyling each site from scratch
- When injected controls depend on a native player bar, use shared renderable-control helpers such as `browser-extension/control-style-utils.js` to decide readiness; do not hardcode site-specific native button classes unless a site truly requires them for spacing or alignment

---

## States

Use these meanings consistently:

- Hover: slightly brighter or lifted, never fully restyled
- Focus/selected: accent border + accent text/surface
- Loading: accent spinner, lightweight footprint
- Danger: red dot, red text, or red hover only when the action or status is truly destructive
- Disabled: lower emphasis via opacity and reduced contrast, but still readable

## Copy Direction

- Prefer short, action-oriented copy over implementation-oriented descriptions.
- Avoid exposing technical details unless the user must act on them.
- Reuse the same wording for the same state across desktop surfaces and extension surfaces.
- Helper copy should answer "what happens next?" or "why does this matter?" in one short line.

---

## Review Checklist

- Does this use a semantic token instead of a duplicated literal?
- Does this control match the existing field/button/toggle pattern?
- Is emphasis reserved for the few states that matter?
- Would this still feel like FlowSelect if shown next to the current main window?
- Did we improve clarity without changing the product's visual personality?
