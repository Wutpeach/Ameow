# Browser Extension Download Experience Design

## Objective

Redesign Ameow's browser extension download experience as a coherent set of complementary surfaces:

- Browser toolbar popup: global status, preferences, and recovery.
- In-page floating launcher: current-page download actions.
- Element picker: precise user-targeted capture for complex pages.
- Existing injected controls: preserved until the new model proves itself.

The first implementation phase should be small enough to ship, but the design should not force later rework when drag, lock, site disablement, and provider evidence contracts mature.

## Platform Premise

Ameow's browser extension is designed to be used together with the desktop app. The complete product workflow requires both sides: the extension captures browser context and the desktop app owns runtime, queueing, output, and downloader execution.

The target environment is desktop browsers paired with Ameow desktop. Mobile/touch support and full keyboard-accessible operation are not planned extension features and should not constrain interaction design.

## Surface Roles

## Development Phases

### Phase 1: MVP

Goal: prove the new browser-extension download model with the smallest complete user journey.

What users get:

- A desktop-browser in-page floating launcher mounted with Shadow DOM.
- A collapsed edge handle that shows Ameow availability / desktop connection state.
- Hover expansion into icon-first actions:
  - Pick download.
  - Download current content.
  - More.
- More menu with:
  - Hide on this site.
  - Switch left/right side.
- Toolbar popup remains the global status and preference surface:
  - connection status;
  - quality preference;
  - launcher enabled/hidden state;
  - restore launcher for the current site;
  - conditional "download this page/current content" fallback only when launcher is unavailable.
- Quality selection remains in the toolbar popup for MVP. The launcher reserves design space for a later quality status/action but does not render a quality indicator or quality hover flyout in MVP.
- Element picker mode:
  - hover highlights likely target regions;
  - click selects one target;
  - no full-page media candidate list.
- Current-content download mode:
  - reads current URL, page metadata, active/modal context, and visible/current media hints;
  - produces one interaction-scoped evidence payload.
- Extension evidence survives the desktop queue path:
  - content script -> background -> `video_selected_v2` -> `queue_video_download` -> provider routing.

MVP technical requirements:

- Shadow DOM style isolation for the launcher.
- Launcher config in `chrome.storage.local`:
  - enabled;
  - side;
  - vertical position, even if drag is deferred;
  - disabled-site patterns.
- Background/popup/content-script state synchronization for:
  - desktop connection state;
  - launcher availability;
  - launcher hidden/disabled state;
  - quality preference.
- Injection availability detection so popup can show fallback only when needed.
- Provider-owned source selection remains the backend rule. No global URL normalization layer.

MVP validation cases:

- A clear single-content page can use Download current content.
- A multi-content page can use Pick download to target one item.
- Douyin `jingxuan?modal_id=...` is accepted as a user-facing entry point. The extension should extract raw page evidence such as `modal_id`; the desktop Douyin provider should decide whether to synthesize a backend-acceptable `/video/{id}` source.
- Instagram current post/reel capture can provide a usable URL, shortcode, or fallback evidence without requiring manual copied links.
- Hiding launcher on a site removes it, and popup can restore it.
- Existing injected buttons continue to work unchanged.

MVP non-goals:

- No full-page media candidate list.
- No context-menu/right-click download as an extension path.
- No removal of existing injected buttons.
- No mobile/touch/full keyboard operation.
- No full options page unless a real settings destination is introduced.
- No global guarantee that one normalized URL works for all downloaders.
- No confidence-based confirmation UX in this task, because reliable confidence scoring would likely require site-specific adaptation.

MVP open choice:

- Quality selection in the floating launcher:
  - Product decision: do not implement quality flyout in MVP.
  - Product decision: do not render launcher quality indicator in MVP; reserve structure so it can be added later.

MVP review gate:

- After MVP implementation, pause for user testing/review.
- Do not start post-MVP enhancements until the user explicitly approves continuing.

### Phase 2: Capture And Provider Hardening

Goal: make the new capture model general and maintainable across backend-supported sites.

What users get:

- Better success rate across common video/image/post sites.
- More accurate current-item capture from detail pages, modal pages, and feed cards.
- Clear failure states when the current target cannot be resolved.

Engineering outcomes:

- A formal extension evidence namespace with typed/validated fields.
- Provider contracts defining:
  - which evidence fields each provider reads;
  - source priority for each downloader engine;
  - fallback behavior when preferred evidence is missing.
- Site/provider adapters for high-value sites such as Douyin and Instagram, without turning the system into a global URL normalizer.
- Tests for payload preservation, provider source selection, and representative site cases.

### Phase 3: Launcher Maturity

Goal: make the floating launcher comfortable for daily use across many websites.

Start only after MVP user testing/review passes and the user explicitly asks to continue.

What users get:

- Drag-to-reposition.
- Snap-to-left/right edge.
- Persisted vertical position.
- Optional lock behavior if daily use shows it is useful.
- Optional quality flyout if in-page quality switching proves valuable.
- Lightweight site capability hints, such as downloadable / login needed / unrecognized.
- More robust hidden/disabled site management.

Engineering outcomes:

- Launcher positioning model is stable across viewport sizes and common fixed-page UI.
- Collision mitigation exists through side switching, drag, hide-on-site, and restore paths.
- The launcher remains compact and does not become a full toolbar.

### Phase 4: Existing Trigger Rationalization

Goal: simplify the old extension download surfaces after the new model is proven.

Start only after MVP user testing/review passes and the user explicitly asks to continue.

What users get:

- Fewer duplicate download buttons and less visual clutter.
- Site-specific injected controls only where they provide unique value.

Engineering outcomes:

- Audit existing injected buttons by site.
- Keep controls that provide advanced actions, such as screenshot, clip range, or site-specific capture that the launcher cannot replace.
- Remove or demote download-only injected buttons that the launcher fully covers.
- Remove existing context-menu/right-click download code after MVP review, unless a compatibility blocker is discovered.

### Phase 5: Optional Advanced Media Browser

Goal: evaluate a full-page media list only as an explicit post-MVP advanced/diagnostic capability.

Start only after MVP user testing/review passes and the user explicitly asks to continue.

What users might get:

- A secondary media browser for unusual pages where picker/current-content capture is insufficient.
- A clearly separated advanced/debug-style surface, not a default download path.

Constraints:

- Must not replace launcher, current-content download, or picker as the main UX.
- Must not force ordinary users to hunt through page-wide candidates.
- Should be justified by MVP review findings before implementation.

### Final Completed State

After all phases, Ameow's browser extension should have:

- One coherent download interaction model:
  - floating launcher for current-page actions;
  - toolbar popup for global status/preferences/recovery;
  - element picker for precise targeting;
  - current-content download for obvious pages.
- A clear backend contract:
  - extension captures evidence;
  - providers choose engine-specific sources;
  - no brittle one-size-fits-all URL normalization layer.
- A cleaner extension UI:
  - no full-page media waterfall as primary UX;
  - no right-click dependency;
  - no uncontrolled growth of site-specific injected buttons.
- A maintainable support model:
  - generic capture works for long-tail sites;
  - provider/site adapters improve high-value sites;
  - existing desktop runtime and downloader queue remain the execution authority.

### Toolbar Popup

Role: global control and recovery.

The popup should remain compact and calm. It is not the best primary trigger for page-specific downloads because it pulls attention away from the webpage target. Its default layout should focus on:

- desktop connection status;
- download quality preference;
- floating launcher state;
- recovery actions when the launcher is hidden or unavailable;
- entry to full settings.

Current local state:

- `browser-extension/popup.html` currently has app identity, connection status, and quality selection.
- No current-page download action is currently present.

Recommended toolbar layout:

1. Header: Ameow identity and compact extension subtitle.
2. Status card: desktop connection, same semantic state as the floating launcher.
3. Quality card: Highest / Balanced / Saver. This remains the MVP quality control surface.
4. Launcher card: enabled state, current-site visibility, restore/show action when hidden.
5. Footer action: extension-level recovery or help only if there is a concrete destination.

Current-content download should not be shown by default in the popup. It can appear as a conditional fallback only when:

- the page cannot inject the launcher;
- the launcher is disabled for the current site and the user needs a one-time action;
- browser restrictions prevent in-page UI.

The popup should detect launcher availability with a lightweight ping to the active tab. If the page cannot answer, the fallback can appear with wording such as "Download this page" rather than competing with the launcher as a normal primary action.

### Floating Launcher

Role: current-page action surface.

The launcher is the primary page-level entry. It should feel like a small desktop-edge Ameow control, not a toolbar pasted onto every website.

Collapsed state:

- docked to the right edge by default;
- partially hidden, exposing a cat/download handle;
- main handle shows desktop connection state:
  - connected: subtle blue/green status dot or ring;
  - connecting: blue pulse or spinner treatment;
  - offline: muted/danger dot and disabled action affordance.

Expanded state:

- triggered by hover or focus;
- handle slides fully into view;
- action buttons appear as a vertical stack;
- buttons are icon-first with tooltips or compact hover labels.

MVP action order:

1. Pick download: element picker / crosshair icon.
2. Download current content: download arrow icon.
3. More/settings: gear or ellipsis icon.

Later-phase action order can add Quality between current-content download and More if usage shows in-page quality switching is needed.

The launcher should collapse after starting picker mode. It can stay open briefly after current-content download to show queued/failure feedback.

### Quality Flyout

Quality selection may eventually be available in the floating launcher because it affects the immediate download action, but it should not be part of Phase 1 unless explicitly prioritized over other MVP work. Quality is a persistent preference, and an edge-hover flyout adds interaction and viewport collision complexity.

Interaction:

- user hovers the quality button;
- a compact flyout expands away from the edge;
- choices are Highest, Balanced, Saver;
- current preference is marked with active state;
- selecting a choice saves the same preference currently used by `direct-download-quality.js`.

Later-phase design constraints:

- no text-heavy panel;
- each option may be a small segmented item with label, tooltip, and active state;
- flyout should close on pointer leave, outside click, or selection.

### More / Settings Button

The settings button should be treated as a compact "more" menu, not a full settings panel. The current extension does not have an options page, and most first-phase controls already live in the toolbar popup or launcher, so "Open settings" would be an empty promise unless a real destination is added.

The More menu should open as a small launcher-adjacent popover/flyout anchored to the More icon. It should expand inward from the screen edge, stay within the viewport, and close after selection or when the pointer leaves/clicks elsewhere. It should not open a large centered modal or a browser-level settings page in MVP.

MVP menu candidates:

- Hide on this site.
- Move to left/right.

Future menu candidates:

- Disable launcher.
- Lock expanded/attached state.
- Reset position.
- Manage disabled sites.
- Open extension settings, only after a real settings page or desktop deep link exists.

## Icon System

Ameow should keep one icon language across desktop and browser extension surfaces.

Current local fact:

- The app no longer depends on the full `lucide-react` package. Previous cleanup removed it for package-size reasons.
- Desktop React icons now use project-local inline SVG components in `src/components/icons/AppIcons.tsx`, following a lucide-like 24px outline style.

Design rule:

- Browser extension icons should use the same local inline SVG approach and visual vocabulary instead of reintroducing `lucide-react` as a runtime/package dependency.
- It is acceptable to select specific Lucide icon shapes and vendor their SVG paths into the project-local icon set, with any required license attribution preserved.
- If an icon shape exists in the desktop local icon set, reuse or mirror it.
- If a new shape is needed, add a small local SVG path using the same base conventions: 24x24 viewBox, no fill, currentColor stroke, round caps/joins, consistent stroke width.

Candidate launcher icons:

- Pick download: crosshair / mouse-pointer / scan target style.
- Download current content: download arrow into tray or downward arrow.
- More: ellipsis or gear. Prefer ellipsis if the menu is not a full settings surface.
- Hide on this site: eye-off or crossed eye.
- Switch side: panel-left-right / arrows-left-right.
- Quality, if added later: sliders / tune.

Lucide extraction workflow:

1. Choose the exact Lucide icon names during design, for example `Crosshair`, `Download`, `MoreHorizontal`, `EyeOff`, `MoveHorizontal`, and `SlidersHorizontal`.
2. Copy only those icons' SVG child nodes (`path`, `circle`, `line`, `polyline`, etc.) from the Lucide source SVGs.
3. Paste them into a project-local icon module that uses the same `BaseIcon` convention as `src/components/icons/AppIcons.tsx`.
4. Do not import `lucide-react` in runtime code unless a future package-size review explicitly reverses the current local-icon strategy.
5. Preserve Lucide license attribution in the relevant source comment or project notice if SVG paths are vendored from Lucide.

### Element Picker

Picker mode is the precise path for pages with multiple posts, videos, or cards.

Flow:

1. User clicks Pick Download.
2. Launcher collapses.
3. Page enters targeting mode.
4. Hover outlines candidate regions under the pointer.
5. User clicks the target.
6. Content script builds one interaction-scoped evidence payload from the target and nearby context.
7. The selected target evidence is submitted. Provider/runtime resolution either succeeds or returns a clear failure/guidance state.

The picker must not become a full-page media candidate list.

## Capture Contract Direction

The extension should submit evidence, not a universal normalized URL.

Evidence should include, where available:

- original page URL;
- clicked element URL;
- current canonical / Open Graph URL;
- content id or shortcode;
- site hint.

New fields should live under a nested extension evidence namespace, but `commandRouter.ts` must preserve them explicitly. Current code only normalizes `extensionData.youtube`.

This pass-through is a Phase 1 requirement. Without it, picker/current-content evidence can be captured in the extension but silently lost before provider routing.

Providers remain responsible for source selection. Each provider decides which source each backend engine receives.

### MVP Evidence Payload

Use a small, versioned evidence object under `extensionData.ameowCapture`. Keep existing top-level fields for routing compatibility. Avoid turning the extension into a URL normalizer or provider clone.

Top-level queue payload:

- `url`: the original interaction anchor, such as the current browser URL for current-content download or the literal clicked href/src for picker download. It must not be a provider-synthesized or downloader-specific URL.
- `pageUrl`: the original browser page URL.
- `siteHint`: inferred site id, for example `douyin`.
- `title`: tab/page title when available.
- `videoCandidates`: existing media candidate list when already produced by legacy paths, not the primary intent source and not required for the new launcher flow.
- `selectionScope`: `current_item`.
- `extensionData.ameowCapture`: structured evidence object.

`extensionData.ameowCapture` MVP shape:

```ts
type AmeowCaptureEvidenceV1 = {
  version: 1;
  action: "current_content" | "pick_download" | "popup_fallback";
  pageUrl: string;
  canonicalUrl?: string;
  ogUrl?: string;
  title?: string;
  contentIds?: Record<string, string>;
  targetHref?: string;
  targetSrc?: string;
};
```

The MVP should avoid unbounded DOM snapshots, page-wide scans, active-media inference, and nearby DOM media crawling. Capture only short strings, direct clicked href/src values, page metadata URLs, and known ID values needed for provider decisions.

### Provider Source Synthesis Contract

The extension should not own downloading, deep extraction, or backend-specific URL synthesis. Its job is to capture browser context and raw evidence. The desktop provider owns URL synthesis and source selection for each downloader.

Each desktop site/provider should define accepted source shapes, for example:

- Douyin with `douyin-dl`: likely `/video/{id}` and share-link forms, subject to verification against the managed downloader.
- Instagram with `gallery-dl`: post/reel permalink forms.
- Generic `yt-dlp`: provider-owned accepted URL patterns or the original page URL when no specific adapter exists.

The browser-side resolver may:

- capture canonical or Open Graph URLs already present in the page;
- extract a content id from the visible/current page state;
- capture target href/src from the selected element;
- pass the original page URL as evidence when no better raw evidence is available.

The desktop provider remains responsible for selecting or synthesizing the final engine source from the evidence. Provider contracts exist in the desktop app, not in the extension, so extension and desktop releases are less tightly coupled.

### Douyin MVP Example

Douyin is a key MVP example, not a special-case architecture. Users can easily obtain URLs like `https://www.douyin.com/jingxuan?modal_id=...`, while upstream/downloader examples commonly use links like `https://www.douyin.com/video/{id}` and share-link forms.

For MVP, define Douyin's accepted source shapes in the desktop provider contract after verifying managed `douyin-dl` behavior. The expected first shape is:

- `https://www.douyin.com/video/{contentId}`

Extension-side Douyin evidence extraction should:

1. Parse current URL for `modal_id`.
2. Parse current URL or page links for `/video/{id}`, `/note/{id}`, or `/gallery/{id}`.
3. Inspect page metadata for canonical/Open Graph URLs.
4. Inspect selected/picker target ancestry for anchors or embedded ids.

Desktop-provider Douyin source selection should:

1. Prefer an existing canonical/Open Graph URL when it is already an accepted Douyin source shape.
2. If `contentIds.modal_id` exists and `/video/{id}` is accepted by `douyin-dl`, synthesize `https://www.douyin.com/video/{id}`.
3. Fall back to current `pageUrl ?? url` behavior when no evidence applies.

Phase 1 should include tests proving that a `jingxuan?modal_id=...` payload can produce a provider-acceptable Douyin source URL in `src/sites/douyin.ts` without requiring the user to manually copy a share short link.

### Deferred Media Context Extraction

Active media detection, selected-target ancestor/descendant media crawling, and nearby link/media inference are explicitly deferred out of MVP.

Reasons:

- They can become site-sensitive quickly on virtualized feeds, custom players, closed shadow roots, canvas renderers, and anti-scraping-heavy pages.
- They risk recreating a hidden page-wide candidate discovery system under a different name.
- They are not required for the core MVP proof: Douyin-style ID extraction, canonical/OG capture, direct clicked href/src capture, provider-owned source synthesis, and evidence pass-through.

Post-MVP, this can be reconsidered as a bounded enhancement only if real-world testing shows the low-cost evidence set is insufficient. If added later, it should be implemented behind a strict interaction scope and tested as a helper signal, not as the primary intent model.

## State Sync And Availability

The popup and launcher share state:

- desktop connection state;
- quality preference;
- launcher global enabled state;
- launcher current-site hidden/disabled state.

Phase 1 should define one synchronization path. Recommended shape:

- background remains the authority for desktop connection state and broadcasts updates with `chrome.runtime.sendMessage`;
- quality preference continues to use existing `direct-download-quality.js` storage helpers and storage change notifications;
- launcher config lives in `chrome.storage.local`;
- content script exposes a small ping/status message so popup can tell whether the launcher is mounted for the active tab.

### Popup Ping Protocol

Popup should ask the active tab whether the launcher is available before showing launcher-specific recovery or fallback actions.

Message from popup/background to active tab:

```ts
{
  type: "ameow_launcher_ping";
  requestId: string;
}
```

Content-script response:

```ts
{
  ok: true;
  requestId: string;
  mounted: boolean;
  visible: boolean;
  hiddenForSite: boolean;
  side?: "left" | "right";
  version: 1;
}
```

Timeout behavior:

- Use a short timeout, around 300-500 ms.
- No response means launcher unavailable for popup purposes.
- If unavailable, popup may show a conditional fallback current-page download action and/or a recovery action if storage says the site is hidden.

Storage remains the source of truth for user config, while ping answers runtime availability for the current page.

## Injection And Layering

The launcher should use Shadow DOM style isolation. Host-page CSS should not affect it.

Layering requirements:

- fixed position;
- maximum practical z-index, matching the Read Frog reference pattern;
- print-hidden;
- left/right side support in config;
- viewport boundary checks for expanded controls and future flyouts.

Restricted pages and injection failures should degrade through the popup fallback rather than failing silently.

## Accessibility

Phase 1 is mouse-first. Mobile/touch support and full keyboard operation are not planned extension features because Ameow requires the desktop app plus desktop browser extension workflow. Basic implementation should still avoid hostile accessibility regressions where cheap, such as keeping accessible labels on icon buttons.

## Open Decisions

- Should the popup fallback "Download current content" exist only when the launcher is unavailable, or be available behind a secondary action at all times? Current recommendation: only when unavailable.
- Drag-to-reposition is deferred out of MVP while preserving config shape for later.
- Should the main launcher status use green for connected or stay with Ameow blue to avoid adding too much success color to the surface?
- Global launcher disable stays out of the MVP More menu; global enable/disable belongs in the toolbar popup.
