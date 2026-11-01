# brainstorm: settings page layout redesign

## Goal

Redesign the desktop settings window so the first-level categories read as clear page navigation instead of another row of setting buttons, while also regrouping settings by user task and preserving FlowSelect's compact, restrained desktop language.

## What I already know

* The user feels the current first-level category controls are hard to distinguish from in-page controls like theme switching and language selection.
* The user wants to keep the `Plugins` first-level name because the product may grow into a fuller plugin system later, so the information architecture should reserve that future direction.
* The user does not yet have a clear picture of the proposed left-side navigation rail, so solution discussion should use concrete wireframe-like examples instead of abstract layout terms.
* The current settings window is a fixed secondary window opened at `320x400` from [`src/App.tsx`](/D:/FlowSelect/src/App.tsx#L3654).
* The current settings page lives in [`src/pages/SettingsPage.tsx`](/D:/FlowSelect/src/pages/SettingsPage.tsx) and uses three top-level tabs: `general`, `plugins`, and `advanced`.
* The current tab rail uses a field-like surface recipe via `getFieldSurfaceStyle(...)`, while the theme switch uses `getSelectableOptionStyle(...)`; both end up reading as the same class of compact selectable buttons.
* Current grouping:
  * `general`: theme, language, output folder, shortcut, launch at startup
  * `plugins`: AE Portal
  * `advanced`: app version/update, support log export, downloader/runtime status, dev tools
* The user wants `rename-on-download` moved out of `Plugins` and treated as a broader general-behavior setting.
* FlowSelect's design system says settings should be grouped by task, repeated control types should share treatment, and hierarchy should be obvious within 2 seconds.
* `.impeccable.md` defines the current design context as `compact, intentional, polished`, with a utility-first, calm, slightly neon tone and an explicit instruction to avoid loud or generic redesign patterns.
* A prior UI optimization brainstorm in [archived PRD](/D:/FlowSelect/.trellis/tasks/archive/2026-04/03-17-brainstorm-impeccable-ui-optimization/prd.md) already established that settings should be improved through hierarchy, spacing rhythm, and control clarity rather than a broad visual rebrand.

## Assumptions (temporary)

* All existing settings remain available in this pass; the work is about hierarchy, naming, grouping, and layout rather than feature removal.
* The redesign should stay inside the existing FlowSelect shell language and shared tokens instead of inventing a brand-new settings chrome.
* The settings page should preserve the current compact window size rather than expanding to make room for a side navigation layout.
* The settings page can adopt stronger navigation semantics only if they fit within the existing top-of-page footprint.
* Developer-only tools should remain accessible but should not compete with user-facing settings for visual priority.
* `Plugins` should remain a durable top-level bucket even if its current content is only a partial preview of the future plugin/system surface.

## Open Questions

* None for the layout-direction pass. Ready for final confirmation.

## Requirements (evolving)

* The first-level categories must read immediately as page navigation, not as peer controls within the current section.
* Page-level navigation must use a clearly different visual language from field buttons, toggles, and selectable options.
* The redesign must preserve a top navigation model instead of adding a left-side rail or requiring window expansion.
* Settings must be regrouped by user task / mental model rather than legacy buckets that mix unrelated items.
* The first-level `Plugins` label must be preserved as a future-facing navigation category.
* The rename-on-download controls should move out of `Plugins` and be treated as a general download-behavior setting.
* `General` should be internally staged into at least two clearer groups:
  * basic preferences: theme, language, shortcut, launch at startup
  * download behavior: output folder and rename behavior
* Advanced and developer-oriented capabilities must remain available without dominating the default experience.
* The layout must stay readable and scannable inside the fixed `320x400` settings window.
* The redesign must preserve the existing FlowSelect tone: compact, restrained, polished, and slightly neon rather than flashy.
* `Plugins` should present as an early plugin-management page rather than an almost-empty placeholder tab.

## Acceptance Criteria (evolving)

* [ ] In the redesigned structure, a new user can distinguish top-level page navigation from setting controls within 2 seconds.
* [ ] Each first-level category has a clear semantic label and contains settings that feel obviously related.
* [ ] `Rename` is no longer grouped under `Plugins`; it appears in a category that reads as general behavior/settings.
* [ ] `General` has a visible split between everyday preferences and download behavior, so output/naming controls feel related rather than scattered.
* [ ] `Plugins` feels like a deliberate management surface for current integrations and future plugin capability, not an underfilled placeholder.
* [ ] The page works within the existing `320x400` window without hierarchy collapsing into visual crowding or requiring window expansion.
* [ ] Developer-only controls are visually de-emphasized relative to everyday settings.
* [ ] The proposed structure is implementable with existing shared primitives and token recipes, with only focused additions if needed.

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Out of Scope (explicit)

* A full FlowSelect visual rebrand
* Adding entirely new settings features unrelated to hierarchy or regrouping
* Reworking the main floating window in the same implementation pass unless a tiny consistency adjustment becomes necessary
* Broad motion/color experiments that make the UI louder instead of clearer

## Research Notes

### Current structural diagnosis

* The current tab rail is placed inside the scrollable content body rather than behaving like dedicated navigation chrome.
* The tab buttons and theme toggle buttons share nearly the same compact selected-state language, so the user has to infer hierarchy from position alone.
* `plugins` is not a stable mental-model category because it currently mixes an external integration (`AE Portal`) with a file-renaming behavior.
* `advanced` currently combines system maintenance, troubleshooting, runtime/download infrastructure, and developer-only tools, making it heavier than the other buckets.
* The user explicitly prefers keeping top navigation and does not want the settings window expanded to accommodate a left-side rail.
* The user chose to move rename-on-download out of `Plugins`, which makes the plugin bucket semantically cleaner but also lighter in current-day content.
* The user prefers `Plugins` to become a clearer plugin-management skeleton now rather than staying as a thin future-facing placeholder.
* The user prefers `General` to group output folder and rename behavior together under a clearer download-behavior area instead of leaving rename as an isolated section.

### Feasible approaches here

**Approach A: Header-Level Navigation Strip + Section Staging** (Selected)

* How it works:
  * Keep top navigation, but move it into dedicated chrome directly under the window header and make it visually unlike field controls.
  * Use integrated `Header Tabs` instead of a detached segmented control, so the navigation reads as part of window-level chrome rather than as another settings widget row.
  * Strengthen section staging below with clearer grouping and spacing rhythm.
  * Treat `Plugins` as a management page skeleton with a concise intro plus current integrations, not just a lone settings block.
  * Rough wireframe:
    * `General  Plugins  Advanced`
    * `active tab uses a clear header-level indicator rather than field-button fill treatment`
    * `-----------------------------------`
    * `Theme`
    * `Language`
    * `Output folder`
* Pros:
  * Preserves the compact settings-window footprint.
  * Keeps the navigation model familiar to the user.
  * Solves the hierarchy issue without requiring a wider window.
* Cons:
  * Still relies on a horizontal compact strip in a narrow window.
  * Needs careful styling to avoid still reading as a generic button row.

**Approach B: Single Flow + Grouped Sections + Lightweight Index**

* How it works:
  * Remove hard tabs and turn the page into one continuous settings flow.
  * Use section dividers / micro index navigation to jump between groups.
  * Preserve `Plugins` as an in-page anchor / group title for future expansion rather than as a hard tab.
* Pros:
  * Simplest mental model and strongest feature discoverability.
  * Avoids hard content partitioning.
* Cons:
  * Can feel long and dense in a `320x400` utility window.
  * Harder to keep advanced/dev settings visually subordinate without adding more disclosure patterns.

## Decision (ADR-lite)

**Context**: The current first-level categories do not read as real navigation, but the settings window is intentionally compact and should not expand just to host a different navigation layout.

**Decision**: Preserve top navigation and redesign it as dedicated page-level tabs directly under the window header, with a visual language clearly separated from field/button controls. Keep `Plugins` as a durable first-level label for future plugin-system growth.
Use the `Header Tabs` treatment rather than segmented or underline-only tabs so the control reads as window navigation first and settings UI second.

**Consequences**:

* The redesign must solve hierarchy mostly through chrome placement, spacing, and tab semantics rather than through a wider two-column shell.
* Some current content groupings will still need cleanup so the preserved `Plugins` bucket feels intentional today while remaining extensible tomorrow.
* The active top-level tab should rely on placement, typography, and a restrained indicator instead of reusing the filled selectable-option styling currently used by in-page controls.
* `Rename` should be regrouped into a general-behavior area rather than presented as plugin functionality.
* `Plugins` should be framed as the beginning of a plugin/integration management surface, using current AE Portal support as the first concrete entry.
* `General` should be visually broken into preference and download-behavior stages so related controls feel bundled without adding another full navigation level.

## Technical Approach

* Top-level shell:
  * Keep the existing window shell and compact size.
  * Convert the current button-like tab row into integrated `Header Tabs` placed directly under the header.
  * Use placement, typography weight, spacing, and a restrained active indicator to separate navigation from in-page control styling.
* `General` page:
  * Stage content into two groups:
    * preferences: theme, language, shortcut, launch at startup
    * download behavior: output folder, rename toggle, rename options, rename preview
  * Keep this as one scrollable pane, but use group spacing and labeling so the two clusters read immediately.
* `Plugins` page:
  * Add a short page-level description that frames the area as plugin/integration management.
  * Present AE Portal as the first managed capability inside a clear group such as "Installed / Available integrations".
  * Leave structural room for future plugin entries without making the page feel empty.
* `Advanced` page:
  * Group system maintenance and diagnostics: app update, support log export, downloader/runtime management.
  * Keep developer-only tools visually lowest priority and only present in dev builds.

## Technical Notes

* Relevant files inspected:
  * [`src/pages/SettingsPage.tsx`](/D:/FlowSelect/src/pages/SettingsPage.tsx)
  * [`src/components/ui/neon-section.tsx`](/D:/FlowSelect/src/components/ui/neon-section.tsx)
  * [`src/components/ui/neon-field-button.tsx`](/D:/FlowSelect/src/components/ui/neon-field-button.tsx)
  * [`src/components/ui/shared-styles.ts`](/D:/FlowSelect/src/components/ui/shared-styles.ts)
  * [`.trellis/spec/frontend/design-system.md`](/D:/FlowSelect/.trellis/spec/frontend/design-system.md)
  * [`.impeccable.md`](/D:/FlowSelect/.impeccable.md)
* `ace-tool` is not available in this environment, so I used literal search with `rg` as a fallback and verified the relevant ownership files manually before proposing layout changes.
* The current work is in brainstorm/discovery only; implementation has not started.
