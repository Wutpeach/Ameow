# Brainstorm: Settings Button Architecture

## Goal

Review the current desktop settings window button and control architecture, identify where the page is already straining under increased control density, and define a scalable information architecture for future settings growth without degrading discoverability, clarity, or maintenance.

## What I already know

* The current settings window is opened from [`src/App.tsx`](D:\FlowSelect\src\App.tsx#L3653) with a fixed size of `320x400` defined at [`src/App.tsx`](D:\FlowSelect\src\App.tsx#L907).
* The page is currently implemented as one vertically scrollable column in [`src/pages/SettingsPage.tsx`](D:\FlowSelect\src\pages\SettingsPage.tsx#L1144).
* The current page includes at least these user-facing sections:
  * theme
  * language
  * app update preference
  * output folder
  * shortcut recording
  * launch at startup
  * rename rules
  * AE portal
  * downloaders/runtime
  * dev-only UI lab section in development builds
* The current page mixes several different control weights in the same linear flow:
  * persistent preferences (`NeonToggle`, `NeonDropdownField`)
  * field-like one-shot actions (`NeonFieldButton`)
  * inline confirm/cancel actions during shortcut recording
  * operational tooling actions such as downloader update and runtime recheck
  * hidden diagnostic action via version double-click in the footer at [`src/pages/SettingsPage.tsx`](D:\FlowSelect\src\pages\SettingsPage.tsx#L840)
* The existing design-system guidance already says settings should be grouped by task, not arbitrary blocks, and that dense layout is acceptable only if hierarchy remains obvious in 2 seconds. See [`.trellis/spec/frontend/design-system.md`](D:\FlowSelect\.trellis\spec\frontend\design-system.md).
* FlowSelect already has reusable compact primitives for section shells, field buttons, toggles, dropdowns, and compact action cards:
  * [`src/components/ui/neon-section.tsx`](D:\FlowSelect\src\components\ui\neon-section.tsx)
  * [`src/components/ui/neon-field-button.tsx`](D:\FlowSelect\src\components\ui\neon-field-button.tsx)
  * [`src/components/ui/neon-toggle.tsx`](D:\FlowSelect\src\components\ui\neon-toggle.tsx)
  * [`src/components/ui/neon-dropdown-field.tsx`](D:\FlowSelect\src\components\ui\neon-dropdown-field.tsx)
  * [`src/pages/settings/DownloaderDeck.tsx`](D:\FlowSelect\src\pages\settings\DownloaderDeck.tsx)

## Assumptions (temporary)

* More settings and action buttons will continue to be added.
* New additions are likely to include both normal preferences and troubleshooting / operational controls.
* The team probably wants to preserve the compact floating-window character instead of turning settings into a large conventional desktop preferences window immediately.

## Open Questions

* None for this wireframe revision.

## Requirements (evolving)

* The settings architecture should scale cleanly as more controls are added.
* The page should separate persistent preferences from one-shot operational actions.
* The page should keep frequent settings easy to scan within a compact window.
* Hidden or diagnostic-only actions should not compete with normal user settings for primary attention.
* The architecture should remain implementable with the existing FlowSelect compact design system.

## Acceptance Criteria (evolving)

* [ ] We can explain which parts of the current settings page are already approaching scalability limits.
* [ ] We define a recommended information architecture for the next stage of settings growth.
* [ ] We define concrete heuristics for how future buttons/settings should be added without creating another monolithic scroll pile.
* [ ] We identify what is in MVP versus what can wait for a later redesign phase.

## Definition of Done (team quality bar)

* A concrete recommendation exists for the next settings IA step.
* The recommendation includes trade-offs, not only general UX principles.
* The recommendation is grounded in the current codebase and current FlowSelect UI constraints.
* Future additions can follow explicit rules instead of ad hoc button placement.

## Research Notes

### Current codebase pattern

* The current page is already using progressive disclosure in a limited way:
  * rename details expand only when rename is enabled
  * AE executable selection appears only when AE portal is enabled
  * shortcut confirm/cancel appears only while recording
* The downloaders section is already treated differently from normal settings by using a compact deck/card model instead of plain sections.
* This suggests the codebase already acknowledges that not every "setting" should be represented as an equal-height block in one flat list.

### Scalability pressure points in the current page

* The page is currently linear, so every new section increases both scroll depth and scan time.
* Action-heavy sections such as downloader maintenance and runtime repair are cognitively heavier than ordinary preferences, but they currently live beside simple toggles in the same visual hierarchy.
* Some actions are discoverability outliers:
  * version double-click export is effectively invisible
  * dev-only actions live in the same overall settings surface as end-user controls
* Some sections are "simple settings", while others are mini workflows:
  * theme and startup toggle are simple settings
  * shortcut recording is a short state machine
  * rename rules are a conditional form
  * downloader/runtime is a compact operational console

### Feasible approaches here

**Approach A: Keep one page, but formalize section priority**

* How it works:
  * Keep the current one-column page.
  * Reorder sections into clear groups such as Everyday, Downloads, Integration, Troubleshooting.
  * Move dev/troubleshooting/hidden actions lower and visually demote them.
  * Continue using inline progressive disclosure for advanced controls.
* Pros:
  * Smallest implementation cost.
  * Minimal interaction change for existing users.
  * Good short-term cleanup if only a few more settings are coming.
* Cons:
  * Still eventually hits scroll-density limits.
  * Does not fundamentally solve mixed interaction weights.
  * Future contributors may still add new sections without strong structural guardrails.

**Approach B: Add lightweight category navigation inside the settings window** (Recommended)

* How it works:
  * Introduce 3 top-level categories inside the same 320x400 window:
    * General
    * Plugins
    * Advanced
  * Each category keeps the existing compact section primitives, but only shows its own subset.
  * General contains the high-frequency everyday settings.
  * Plugins contains plugin-like capabilities and nested setup flows.
  * Advanced contains support, developer, and downloader maintenance content.
* Pros:
  * Best balance between scalability and compactness.
  * Preserves FlowSelect's compact child-window feel.
  * Gives future contributors an obvious place to add new controls.
  * Reduces first-screen noise without requiring a large desktop-style preferences rewrite.
* Cons:
  * Requires light navigation state and some migration of section ordering.
  * Adds one more interaction layer for users looking for rarely used settings.

**Approach C: Convert settings into drill-in pages**

* How it works:
  * Turn settings into a small home page with rows such as General, Download, Integration, Support.
  * Each row opens a subpage or stacked detail view.
  * Complex mini workflows live on their own screens.
* Pros:
  * Most scalable long-term.
  * Supports many more settings and richer troubleshooting flows.
  * Cleanly separates simple preferences from operational tooling.
* Cons:
  * Largest interaction and code change.
  * May feel too heavyweight for the current product size.
  * Risks making frequent settings slower to reach unless shortcuts are designed carefully.

## Expansion Sweep

### Future evolution

* More languages, integrations, runtime tools, and troubleshooting affordances will likely be added.
* The architecture should not assume every new control is just another inline toggle or button.

### Related scenarios

* Main-window recovery entry points and settings-window troubleshooting controls should remain conceptually aligned.
* Dev-only tools and support tooling need a deliberate discoverability policy instead of being mixed into primary user settings.

### Failure & edge cases

* Too many same-weight buttons increase misclick risk and make it harder for users to predict whether a control changes a preference, opens a picker, or runs an operation.
* Hidden affordances are cheap in layout cost but expensive in support cost because users cannot self-discover them.

## Decision (ADR-lite)

**Context**: The current settings page has already evolved beyond a simple list of preferences. It now mixes persistent settings, short workflows, runtime/tooling actions, and hidden support affordances inside one compact linear page.

**Decision**: Prefer a lightweight category-navigation architecture next, instead of continuing to add more sections to a single flat scroll page.

**Consequences**:

* Short term, the page becomes easier to scan without changing the underlying visual system.
* Medium term, future settings can be added by category instead of by "next open slot in the page".
* The team must define category ownership rules so new buttons do not drift back into a flat pile.

## Technical Approach

Recommended staged rollout:

1. **IA cleanup without visual reinvention**
   * Reclassify each existing setting/control into one of four buckets:
     * Frequent preference
     * Conditional preference
     * Operational tool
     * Diagnostic / developer
2. **Introduce category tabs or segmented navigation**
   * Keep the same shell, spacing, and compact section components.
   * Swap the content area based on the active category.
3. **Normalize row patterns inside each category**
   * Preference rows: toggle/dropdown/field
   * Conditional preference rows: toggle + nested detail
   * Operational rows: compact status summary + explicit action
   * Diagnostic rows: lower priority placement and clearer labeling
4. **Optional later step**
   * If categories themselves become crowded, move only the heaviest areas such as runtime/support into drill-in detail views.

## Concrete Guidance For Future Buttons

* Add new controls by **user task domain**, not by control type.
* Use inline buttons only for:
  * two stable mutually exclusive choices
  * immediate confirm/cancel inside a temporary flow
* Use dropdowns instead of button pairs when the option set may grow again.
* Treat any control that triggers external I/O, background work, re-checks, updates, or repair flows as an **operational tool row**, not as a normal preference.
* Keep developer-only and support-only controls out of the primary first-screen settings path.
* Avoid hidden affordances for important support actions; if an action matters, give it an explicit home under Advanced or Support.

## Proposed Category Model

* **General**
  * theme
  * language
  * launch at startup
  * output folder
  * shortcut
* **Plugins**
  * AE export / AE integration
  * rename rules
* **Advanced**
  * support log export
  * developer toggles
  * UI Lab
  * yt-dlp / gallery-dl deck anchored at the bottom

## Low-Fidelity Wireframe

### Option 1: Recommended

Keep the same compact settings window shell, but add a small category switcher below the header. The selected tab is the page label, so the content area should not repeat an extra uppercase heading like `GENERAL` or `ADVANCED`.

```text
+--------------------------------------------------+
| Settings                                     [x] |
+--------------------------------------------------+
| [General:selected] [Plugins] [Advanced]          |
+--------------------------------------------------+
| Theme                                            |
| [ Black        ] [ White        ]                |
|                                                  |
| Language                                         |
| [ Chinese                         ▾ ]            |
|                                                  |
| Output Folder                                    |
| [ D:\...\Downloads\FlowSelect         open ]     |
|                                                  |
| Shortcut                                         |
| [ Ctrl+Shift+V                        record ]   |
|                                                  |
| Launch At Startup                                |
| Start FlowSelect on login               [off ]   |
+--------------------------------------------------+
|                                                  |
+--------------------------------------------------+
```

```text
+--------------------------------------------------+
| Settings                                     [x] |
+--------------------------------------------------+
| [General] [Plugins:selected] [Advanced]          |
+--------------------------------------------------+
| AE Export / AE Integration              [off ]   |
| [ C:\...\AfterFX.exe                  browse ]   |
|                                                  |
| Rename Downloaded Media                 [ on ]   |
|                                                  |
| Rename Rule                                      |
| [ Descending Number                  ▾ ]         |
| Prefix   [ project_                ]             |
| Suffix   [ final                   ]             |
| Preview  project_99_final.mp4                    |
|                                                  |
+--------------------------------------------------+
|                                                  |
+--------------------------------------------------+
```

```text
+--------------------------------------------------+
| Settings                                     [x] |
+--------------------------------------------------+
| [General] [Plugins] [Advanced:selected]          |
+--------------------------------------------------+
| App Version                                      |
| +----------------------------------------------+ |
| | FlowSelect                          current  | |
| | v0.0.0                                         | |
| | Up to date / update available / last checked  | |
| |                            [check] [update]  | |
| +----------------------------------------------+ |
|                                                  |
| Support                                          |
| [ Export support log                    export ] |
| hint: open exported log folder after success     |
|                                                  |
| Developer                                        |
| Extension injection debug               [off ]   |
| [ Open UI Lab                           open  ]  |
|                                                  |
| Downloader Maintenance                           |
| +----------------------------------------------+ |
| | yt-dlp                                1 / 3 | |
| | v2026.xx                                       | |
| | Up to date / update available                 | |
| |                                     [update] | |
| +----------------------------------------------+ |
| | runtime                               2 / 3 | |
| | all ready / missing ffmpeg                     | |
| | progress / next action / repair hint          | |
| |                                    [recheck] | |
| +----------------------------------------------+ |
| | gallery-dl                            3 / 3 | |
| | v1.xx                                          | |
| | Up to date / update available                 | |
| |                                     [update] | |
| +----------------------------------------------+ |
+--------------------------------------------------+
|                                                  |
+--------------------------------------------------+
```

### Interaction Notes

* The top category switcher can be implemented as a compact segmented row using the same selection treatment already used by theme buttons.
* Keep only one scroll area: the content body below the category row.
* The first screen in each category should expose only primary rows.
* Secondary controls remain inline only when they are tightly coupled:
  * rename details under rename toggle
  * AE executable picker under AE toggle
  * shortcut confirm/cancel only while recording

### Row Types

Use only 5 row archetypes so future additions stay predictable:

* **Preference row**
  * label + toggle/dropdown
* **Field-action row**
  * label + field-like button, for path pickers and shortcut trigger
* **Expandable preference row**
  * toggle or selector first, nested controls below when enabled
* **Operational card row**
  * title + current status + one explicit action
* **Version card row**
  * app identity + current version + update status + reserved actions such as check/update

### Tab Behavior

* The category buttons need an explicit selected state because they now act as page navigation, not just quick filters.
* `selected` in the wireframe does not mean a small glow dot. It means the tab button itself is in the active state.
* Recommended selected treatment:
  * accent-tinted surface
  * stronger border
  * primary text
  * optional subtle tab-level glow if it remains restrained
* Recommended unselected treatment:
  * normal field surface
  * secondary text
* Do not repeat another category title inside the page body; the selected tab already communicates where the user is.

### Option 2: If You Want Even Less Change

Keep one long page, but insert persistent group headers and a mini quick-jump strip:

```text
+--------------------------------------------------+
| Settings                                     [x] |
+--------------------------------------------------+
| [General] [Plugins] [Advanced]                   |
+--------------------------------------------------+
| Theme                                            |
| Language                                         |
| Startup                                          |
| Output Folder                                    |
| Shortcut                                         |
|                                                  |
| PLUGINS                                          |
| AE                                               |
| Rename                                           |
|                                                  |
| ADVANCED                                         |
| Support Log                                      |
| UI Lab                                           |
| Downloaders                                      |
+--------------------------------------------------+
```

This is cheaper to implement, but weaker than true category switching because all control density still exists in one continuous page.

### Updated Structure Summary

* `General` is now the everyday settings page.
* `Plugins` contains AE export and rename-related flows.
* `General` ordering is:
  * Theme
  * Language
  * Output Folder
  * Shortcut
  * Launch At Startup
* `Advanced` begins with an app-version card, then support/developer tools, with the downloader maintenance deck pinned to the bottom.
* The app-version card should:
  * show the current version clearly
  * use the same compact utility-card language as the rest of the page
  * reserve space for `check` / `update` actions
* The downloader maintenance deck contains 3 cards:
  * `yt-dlp`
  * `runtime`
  * `gallery-dl`
* Version display moves out of the global footer and into the top app-version card inside `Advanced`.
* The earlier 4-category draft is superseded by this 3-category structure.

## Guardrails For "Buttons Keep Increasing"

* If a category exceeds about 5 primary rows, review whether one row should become a subpage or whether two rows belong to another category.
* If a new setting needs more than one secondary action, it is probably no longer a plain settings row.
* If a section contains status, progress, retry, and update actions together, treat it as a tool panel.
* If a control is useful only for debugging/support, it should default to Advanced/Developer placement.
* If the team cannot decide where a new button belongs, that is usually an IA smell rather than a copy/style problem.

## MVP vs Later

### MVP

* Define category boundaries.
* Re-home operational and developer actions.
* Remove reliance on hidden important actions.
* Keep the existing compact shell and existing primitives.

### Later

* Add settings search.
* Add drill-in subpages for heavy areas.
* Add a schema/registry-driven settings renderer for stronger long-term maintainability.

## Out of Scope

* A full visual redesign of the settings window.
* Replacing the existing FlowSelect design system.
* Expanding the settings window into a large conventional desktop preferences app unless later product needs justify it.

## Technical Notes

* Files inspected:
  * [`src/pages/SettingsPage.tsx`](D:\FlowSelect\src\pages\SettingsPage.tsx)
  * [`src/pages/settings/DownloaderDeck.tsx`](D:\FlowSelect\src\pages\settings\DownloaderDeck.tsx)
  * [`src/pages/settings/DownloaderCardContent.tsx`](D:\FlowSelect\src\pages\settings\DownloaderCardContent.tsx)
  * [`src/components/ui/neon-section.tsx`](D:\FlowSelect\src\components\ui\neon-section.tsx)
  * [`src/components/ui/neon-field-button.tsx`](D:\FlowSelect\src\components\ui\neon-field-button.tsx)
  * [`src/components/ui/neon-toggle.tsx`](D:\FlowSelect\src\components\ui\neon-toggle.tsx)
  * [`src/components/ui/neon-dropdown-field.tsx`](D:\FlowSelect\src\components\ui\neon-dropdown-field.tsx)
  * [`.trellis/spec/frontend/design-system.md`](D:\FlowSelect\.trellis\spec\frontend\design-system.md)
* Archived related task:
  * [`.trellis/tasks/archive/2026-03/03-16-settings-language-dropdown/prd.md`](D:\FlowSelect\.trellis\tasks\archive\2026-03\03-16-settings-language-dropdown\prd.md)
  * That task already captured a scaling lesson: fixed two-button language switching did not scale once more languages were expected.
