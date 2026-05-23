# brainstorm: browser extension download experience redesign

## Goal

Design the complete next-generation Ameow browser extension download experience in phases. The first phase should be a minimal MVP that proves the new floating launcher, current-content download, and element-picker capture model. By the end of all planned phases, the browser extension should have a coherent, redesigned download interaction system and capture/provider architecture, not just a Douyin/Instagram-specific patch.

## Requirements

- The browser extension should help capture the user's intended downloadable item when the desktop app cannot infer enough from a pasted URL alone.
- The browser extension is not a standalone mobile product. Ameow's browser extension and desktop app are designed to work together; without either side the workflow is incomplete.
- The target platform is desktop browsers paired with the desktop app. Mobile/touch-first usage is explicitly out of scope and should not constrain MVP interaction design.
- Mobile/touch support and full keyboard-accessible operation are not planned extension features.
- The task is now a phased browser-extension redesign, not only an extension-assisted capture patch.
- The full design should cover user-facing extension interactions, browser-page launcher behavior, capture contracts, provider/source-selection contracts, settings and disablement behavior, rollout from existing injected buttons, and validation strategy.
- Before implementation starts, the browser toolbar popup layout and in-page floating launcher function model should be designed together so the two surfaces have clear responsibilities instead of overlapping actions.
- Phase 1 should remain a minimal MVP that can be implemented and verified without blocking on the full future-state design.
- Later phases should complete the extension download experience redesign through deliberate increments rather than a single large rewrite.
- The core interaction should be anchored to an explicit user action or local page context, not a full-page media inventory that forces users to search through many candidates.
- Douyin desktop URLs such as `https://www.douyin.com/jingxuan?modal_id=7637912431158644014` should be treated as valid user-facing entry points even if the dedicated backend requires a different page shape or identifier.
- Instagram-like pages where the user cannot easily copy a post/reel URL should be handled through extension page context rather than requiring manual URL discovery.
- The design must respect the existing multi-downloader backend reality: `yt-dlp`, `gallery-dl`, `douyin-dl`, and site-specific fallback chains may accept different URL forms.
- The extension should capture raw page evidence that helps the desktop provider choose or synthesize a backend-compatible source. URL synthesis and downloader-specific source selection belong to the desktop provider, not to the extension.
- Top-level download `url` values sent by the extension should represent the original user/browser interaction anchor, not a provider-synthesized backend URL. Any downloader-specific source URL should be created inside the desktop provider.
- URL rewriting must not become a global, cross-downloader promise that one canonical URL works for every engine.
- Site-specific knowledge should be scoped and testable: when a site needs a special locator or extractor payload, that rule should live with the site/provider strategy instead of in a generic normalizer.
- Existing drag/drop, pasted-link, context-menu, detector, and `video_selection`/`video_selected_v2` flows should be reused where they fit, not replaced wholesale.
- The feature must be designed as a general capability for backend-supported sites, not as a Douyin/Instagram-only fix. Douyin and Instagram are motivating examples and MVP validation targets.
- A full-page media candidate list is explicitly forbidden in MVP and must not become the default primary interaction. It may be reconsidered only after MVP review as an explicit advanced/diagnostic capability if the user approves that later phase.
- When the selected item cannot be resolved, the UX should prefer a clear failure or guidance state over a noisy candidate picker. This task should not introduce confidence-scored confirmation flows.
- The design should evaluate an element-picker style interaction, similar to browser inspector targeting, where the user activates a selection mode and clicks the specific page object they want to download.
- The final interaction model should avoid exposing too many competing download behaviors. Prefer a small set of stable, complementary behaviors with clear fallback roles.
- Context-menu download should be removed from the proposed primary interaction set for this task. It is low-frequency in the user's daily workflow and unreliable on sites that block native right-click or replace it with player-owned menus such as YouTube and Bilibili.
- Context-menu/right-click download is not planned as an extension path. Existing context-menu code should be removed after MVP is delivered and reviewed, not during MVP.
- Existing injected buttons should remain unchanged during this task. Removal or retention should be evaluated only after the new interaction model is proven.
- The design should evaluate an in-page edge-attached launcher/window so users do not have to click the browser toolbar extension icon before choosing download actions.
- The floating launcher main button should be able to communicate desktop connection state directly, so users can tell whether download actions are available without opening the toolbar popup.
- Floating launcher action buttons should be icon-first rather than text buttons. Text labels should appear through tooltips or compact hover labels only.
- The floating launcher may eventually offer quality selection, but MVP should be cautious about adding a hover flyout because quality is a persistent preference and edge flyouts increase interaction complexity. Toolbar popup remains the MVP quality surface unless explicitly overridden.

## Acceptance Criteria

- [ ] The PRD defines the full phased goal for browser extension download experience redesign.
- [ ] The PRD separates Phase 1 MVP scope from later phases and the final desired extension state.
- [ ] Toolbar popup responsibilities and floating launcher responsibilities are designed before feature implementation starts.
- [ ] The PRD defines a user-intent capture model that does not require users to choose from a page-wide list of all media.
- [ ] The PRD distinguishes media candidate discovery from user intent resolution.
- [ ] The PRD defines a backend routing principle that avoids requiring one normalized URL to satisfy every downloader.
- [ ] The PRD covers Douyin `jingxuan?modal_id=...` and Instagram post/reel URL capture as motivating MVP cases.
- [ ] The PRD defines a general support model for backend-supported sites, including what works generically and what requires site/provider adapters.
- [ ] The PRD evaluates element-picker targeting as a primary or advanced interaction mode for precise current-item capture.
- [ ] The PRD compares candidate trigger forms by implementation cost, maintenance burden, extensibility, and whether they overlap or complement each other.
- [ ] The PRD narrows the product surface to a small stable set of download behaviors before implementation planning.
- [ ] The PRD decides whether the main trigger should be browser-toolbar based, in-page edge-attached, or a hybrid of both.
- [ ] The PRD/design defines how connection state and quality preference appear between toolbar popup and floating launcher.
- [ ] Context-menu/right-click download is excluded from the primary and future core extension interaction model.
- [ ] The PRD captures open product decisions before implementation planning begins.

## Phased Scope

### Phase 1: Minimal MVP

- Design the browser toolbar popup and in-page floating launcher responsibilities before coding.
- Add the browser-page floating launcher as the primary new extension entry point.
- Provide the MVP launcher action structure:
  - pick download;
  - download current content;
  - more entry with minimal behavior.
- Implement or design enough capture plumbing for the two core actions to produce one interaction-scoped evidence payload.
- Fix the desktop queue normalization path so new extension evidence survives `video_selected_v2` -> `queue_video_download` -> provider routing.
- Keep MVP evidence extraction low-cost: current/page URL, canonical/OG URL, query/path content IDs, and direct picker target href/src. Active media inference and nearby DOM media crawling are deferred out of MVP.
- Define popup-launcher state synchronization for desktop connection status, quality preference, and launcher hidden/disabled state.
- Add launcher injection availability detection so popup can show a conditional current-page fallback only when in-page launcher is unavailable or disabled.
- Treat Phase 1 as mouse-first. Mobile/touch optimization and full keyboard operation are not planned features.
- Keep quality selection in the toolbar popup for MVP. The floating launcher may show a lightweight current-quality indicator, but it should not provide a quality hover flyout in MVP.
- Keep global launcher disable out of the MVP More menu to avoid accidental loss of the in-page entry point. Global enable/disable belongs in the toolbar popup.
- Validate the model on representative cases such as Douyin `jingxuan?modal_id=...` and Instagram current post/reel capture.
- Keep existing injected buttons unchanged.
- Keep context-menu download out of the primary interaction.
- Do not introduce a full-page media candidate list.
- After MVP implementation, pause for user testing/review before starting any post-MVP enhancement phase.

### Phase 2: General Capture And Provider Contracts

- Broaden and harden the extension evidence namespace after the Phase 1 pass-through path exists.
- Define provider-owned source selection so each backend engine receives a source shape it is known to support.
- Add site/provider adapter patterns for high-value sites without making global URL normalization responsible for all cases.
- Add test coverage for extension payload preservation, provider source selection, and fallback behavior.

### Phase 3: Launcher Maturity

- Start only after MVP user testing/review passes and the user explicitly asks to continue.
- Add drag-to-reposition and snap-to-edge behavior.
- Add lock behavior if it proves useful in daily use.
- Add launcher quality flyout if daily use shows quality changes need to be available in-page.
- Add lightweight site capability hints, such as downloadable / login needed / unrecognized, after MVP proves the launcher flow.
- Add persistent launcher controls such as close/hide, without crowding the three primary actions.
- Add robust site disablement and recovery entry points from toolbar/settings.

### Phase 4: Existing Trigger Rationalization

- Start only after MVP user testing/review passes and the user explicitly asks to continue.
- Review existing injected buttons after the new launcher and picker are proven.
- Keep injected buttons only where they provide site-specific advanced value beyond plain download.
- Retire or demote duplicate download-only injected controls where the new launcher covers the use case.
- Remove existing context-menu/right-click download code after MVP, unless a compatibility blocker is discovered during review.

### Phase 5: Optional Advanced Media Browser

- Start only after MVP user testing/review passes and the user explicitly asks to continue.
- Evaluate whether a full-page media list is useful as an advanced or diagnostic tool.
- It must not replace the launcher, current-content download, or element picker as the default user path.
- If implemented, it should be clearly separated from the primary download flow and should avoid forcing ordinary users to hunt through candidates.

### Final State

- The browser extension has a coherent download interaction model:
  - floating launcher as primary entry;
  - one-click current-content download for obvious pages;
  - element picker for precise targeting;
  - provider-owned source selection for backend compatibility;
  - no page-wide candidate waterfall as the main UX;
  - existing injected controls only where they are justified by unique value.

## Surface Responsibility Model

### Browser Toolbar Popup

- Role: global extension control and recovery surface.
- Primary content:
  - desktop connection status;
  - download quality preference;
  - floating launcher enabled/disabled state;
  - quick recovery when the in-page launcher is hidden for the current site;
  - entry to full settings or desktop app settings.
- Should not become the primary current-page download trigger if the floating launcher is available, because toolbar interaction pulls the user away from the webpage target.
- May expose fallback actions only when the page launcher is unavailable or disabled.

### In-Page Floating Launcher

- Role: current-page action surface.
- Primary content:
  - pick download;
  - download current content;
  - optional quality selector;
  - compact settings/menu entry.
- It owns immediate page-context actions because it is close to the content and can enter picker mode naturally.
- It should stay compact and not absorb global preferences that belong in the toolbar popup or desktop settings.
- The main handle should show connection state, for example through a small semantic dot/ring or disabled treatment.

### Existing Injected Buttons

- Role: legacy/specialized site actions.
- They remain untouched during MVP and are reviewed only after the launcher/picker model works.

## Confirmed Local Facts

- Current `browser-extension/popup.html` / `popup.js` / `popup.css` implement a compact toolbar popup with app branding, desktop connection status, and download quality selection.
- Current popup has no current-page download action after the prior removal of popup current-video action.
- `browser-extension/background.js` already registers a context menu for `video`, `page`, `frame`, `link`, and `image` contexts and forwards selections through the existing desktop WebSocket path.
- `browser-extension/background.js` already has generic selection fallback helpers and a `video_selection` -> `video_selected_v2` queueing contract.
- `browser-extension/generic-video-selection-utils.js` already supports candidate classification, merging, and preferred URL selection, but this is candidate handling rather than full user-intent resolution.
- `src/sites/providers.test.ts` shows site providers already choose engine-specific `sourceUrl` values. Examples include Xiaohongshu using page URLs instead of direct CDN candidates, Pinterest ignoring direct media hints and using gallery-dl, Instagram routing through gallery-dl then yt-dlp, and Weibo preserving some wrapper URLs.
- `src/sites/douyin.ts` currently routes Douyin through `douyin-dl` only and uses `input.pageUrl ?? input.url` as the engine source URL.
- `electron/videoDownloadCommands.mts` forwards `extensionData` from `video_selected_v2`, but `src/electron-runtime/commandRouter.ts` currently normalizes only the `extensionData.youtube` subset before building `QueuedVideoDownloadRequest`.
- `src/core/schemas/download-intent-schema.ts` allows unknown `extensionData` keys at the schema level, but the queue command normalization path must still explicitly preserve any new evidence fields.
- A prior archived PRD, `.trellis/tasks/archive/2026-04/04-08-reliable-precise-video-download-trigger/prd.md`, already rejected a waterfall list of all page videos as the primary UX and recommended context-menu plus popup current-video triggers.

## Product Concerns Raised

- The user clarified the full goal is "all download feature redesign and design", not search redesign.
- The user clarified that Ameow's extension must be used with the desktop app; mobile/touch operation is not a future target, so touch-specific concerns should not drive the design.
- The user clarified that mobile/touch/full keyboard operation and right-click download are not planned extension features, not merely deferred MVP items.
- The user wants toolbar popup layout and floating launcher function design completed before actual feature development starts.
- Full-page media enumeration may be noisy when many videos or assets exist on the page, forcing users to hunt through candidates and undermining the convenience goal.
- Global URL normalization is hard to maintain because each backend downloader may support only specific link shapes, and fallback chains may not share one universally valid normalized URL.
- The user confirmed the primary interaction must not be a full-page media candidate list.
- The user later clarified that full-page media list can be considered after MVP as a separate post-review enhancement, not as MVP or the default primary interaction.
- The user accepted the recommended MVP decisions: no quality flyout in MVP, no global disable action in the More menu, and MVP review should use the listed representative scenarios.
- The user rejected adding a confidence-based confirmation feature to this task unless confidence can be judged simply and generically. Because accurate confidence would likely require site-specific adaptation, it is out of scope for this task.
- The user approved adding lightweight site capability hints as a post-MVP item.
- The user wants this to become a generic feature across backend-supported sites; Douyin and Instagram should remain examples, not the whole design scope.
- The user proposed a browser-inspector-like element selection mode as a more elegant "point at the thing to download" interaction.
- The user is concerned that too many download behaviors may make the product feel fragmented; the desired outcome is a few stable behaviors that complement each other.
- The user recommended removing right-click/context-menu download from the near-term plan because it is rarely used and often conflicts with site/player right-click behavior.
- The user wants context-menu/right-click code removed after MVP review rather than during MVP implementation.
- The user wants current injected buttons left untouched until the new approach is validated.
- The user proposed a collapsible edge-attached in-page launcher/window so download actions can be triggered without returning to the browser toolbar.

## Claude Consultation Notes

- Claude agreed with the revised direction: extension should provide raw interaction-scoped evidence, while desktop providers own engine-specific source selection.
- Claude recommended avoiding new top-level WebSocket fields. New evidence should live under a nested extension-data namespace until the contract is stable across extension and desktop releases.
- Claude identified Douyin `modal_id` handling as a real dependency, not a detail: either `douyin-dl` must support that URL shape, or the Ameow provider/runtime needs a site-specific resolution step.
- Claude identified Instagram as lacking a dedicated provider today; if Instagram-specific shortcode/permalink evidence needs provider logic, it may require a provider above the generic `gallery-dl-supported` provider.
- Local verification refined one Claude point: unknown `extensionData` keys are not currently preserved by `commandRouter.ts`; adding a new nested evidence namespace still requires an explicit normalization/pass-through change.
- Second Claude review of the launcher/popup design supported the surface split and Read Frog-inspired edge launcher, but recommended moving quality flyout out of Phase 1, adding conditional popup fallback only when launcher is unavailable, making extension evidence pass-through a Phase 1 requirement, and treating keyboard accessibility plus injection failure detection as MVP requirements.
- Product decision after the second Claude review: the extension is mouse-first by product definition; mobile/touch/full keyboard operation are not planned features. Injection failure detection and extension evidence pass-through remain Phase 1 requirements.
- Product decision after MVP planning: implement MVP first, pause for user testing/review, then continue only if the user explicitly approves post-MVP phases such as quality hover flyout, drag-to-reposition, lock button, old injected button removal, context-menu code removal, and optional full-page media list.

## Emerging Design Direction

- Use "interaction-scoped capture" rather than "page-wide media recognition".
- Treat candidate discovery as supporting evidence only. The selected item should come from the user's current action or visible page context: picker target, current popup/modal, active player, selected card, or current route state.
- Replace "one normalized URL" with provider-owned "source selection". The extension may send original page URL, element URL, extracted content IDs, permalink/canonical URL, direct media candidates, and source labels, but each provider decides whether and how to synthesize the source each backend engine receives.
- Keep synthesized downloader URLs provider-internal. The extension should not rewrite top-level `url` to a guessed downloader-compatible form such as Douyin `/video/{id}`.
- Keep URL transformation site-scoped and testable. A Douyin `modal_id` rule belongs to Douyin strategy/resolution, not to a global normalizer.
- Generalize by defining support tiers:
- Tier 0: generic pass-through for all sites using current tab URL, picker target href/src evidence, site hint, and existing backend routing.
- Tier 1: generic page-context capture for common low-cost web patterns such as canonical URL, Open Graph URL, JSON-LD IDs, and route/query/modal IDs.
- Tier 2: site/provider adapters for high-value or structurally unusual sites that need IDs, shortcodes, tokenized URLs, or engine-specific source decisions.
- Tier 3: downloader/runtime-specific resolvers only when the provider cannot derive a supported source from browser evidence alone.

## Candidate Interaction: Element Picker

- The extension can expose a "pick content to download" mode from the floating launcher and optional toolbar fallback.
- When active, a content script overlays hover outlines on likely content regions and lets the user click the exact post, video, image, card, modal, or player they intend to download.
- The click target becomes the interaction anchor. In MVP, the extension captures only direct target href/src, page metadata, URL-derived IDs, and route/query state. Ancestor/descendant media crawling, nearby media inference, and active player inspection are deferred out of MVP.
- The picker should return one interaction-scoped evidence payload, not a page-wide list.
- The picker should not use high/medium/low confidence scoring in this task. It should submit the selected target evidence and let provider/runtime resolution succeed or return a clear failure/guidance state.
- Known limitations to account for in design: cross-origin iframes, closed shadow DOM, canvas-only rendering, DRM/encrypted media, virtualized feeds where offscreen DOM disappears, and sites that block script injection.

## Floating Launcher Reference Notes

Reference inspected: `D:\read-frogextension-1.33.8-sources`.

- The reference extension mounts page UI through a content script using Shadow DOM (`createShadowRootUi`) and injects styles into the shadow root, which keeps floating UI isolated from host-page CSS.
- Its floating button is a fixed, edge-attached control with `z-index` above page content, stored side (`left`/`right`), normalized vertical position, global enablement, per-site disable patterns, and a lock state.
- The collapsed main button is partially translated offscreen. On hover, it slides fully into view and reveals hidden secondary buttons above/below it.
- It supports pointer-based drag: after long press or movement threshold, the button detaches, previews drag position, then snaps to the nearest viewport side and persists vertical position.
- The reference also exposes close/disable and lock controls on hover, but Ameow should avoid overloading the first MVP with too many chrome controls.

## Proposed Ameow Floating Launcher

- Use a Shadow DOM mounted in-page floating launcher as the primary browser-page entry for the new capture flow.
- Collapsed state:
  - A small Ameow cat/download handle is docked to the right edge by default and partially hidden.
  - It should be quiet enough not to distract from browsing, but visible on pointer approach.
- Hover/expanded state:
  - The handle slides fully into the page.
  - Action buttons appear vertically and use icons as the primary labels.
  - Baseline action order, from top to bottom:
    1. Pick download: precise element-picker mode.
    2. Download current content: fast current-context capture.
    3. Quality: post-MVP optional hover-expanded quality selector. MVP does not include this action.
    4. More/settings: compact launcher menu, not a full settings page.
  - The buttons should be icon-first with tooltips, not text-heavy.
- Interaction rules:
  - Expanded state stays open while pointer is inside the launcher hit area.
  - Clicking pick download immediately enters element-picker mode and collapses the launcher.
  - Clicking current-content download triggers current-page/current-modal capture and gives compact queued/failure feedback.
  - Hovering the quality action may expand a compact flyout with Highest, Balanced, and Saver options; selecting one updates the same download quality preference used by the current toolbar popup.
  - More/settings should not become a large in-page settings panel in MVP. Current agreed actions are "hide on this site" and "switch left/right side"; "open settings" should not be included unless a concrete settings destination exists.
- Configuration:
  - Global enable/disable.
  - Per-site disable list.
  - Side: right by default, optional left.
  - Vertical position: default mid-lower viewport, persisted if dragging is included.
  - Drag-to-reposition/switch side, lock, and persistent launcher controls are desirable future capabilities. The first MVP may defer the interaction implementation, but the settings model should not block adding them later.
- Non-goals for MVP:
  - Replacing existing injected site buttons.
  - Reintroducing context-menu download as a primary path.
  - Showing a full page-wide media candidate list.

## Floating Launcher Follow-Up Capabilities

- Drag-to-reposition and side switching:
  - User can drag the launcher vertically and across the viewport.
  - On release, it snaps to the nearest left/right edge and stores normalized vertical position.
  - This is useful for avoiding site UI conflicts, especially pages with fixed chat, toolbar, or video controls.
- Lock:
  - User can lock the launcher in expanded or attached state so it remains easier to hit.
  - Lock state should be per-user global config, not per-page transient state, unless future feedback suggests site-specific lock behavior.
- Persistent chrome controls:
  - Controls such as close/hide, lock, or move affordances may be shown when the launcher is expanded.
  - These controls should remain secondary to the three core actions and should not make the launcher feel like a full toolbar.
- Recommended sequencing:
  - MVP should ship the stable three-action launcher first unless drag/lock is cheap within the chosen implementation.
  - Persisted config should include enough shape for future fields: enabled, side, vertical position, disabled-site patterns, and optionally locked.
  - Drag/lock can be promoted into the first implementation only if they do not delay picker/current-content capture, which are the core value.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
- Curate implement.jsonl / check.jsonl as spec/research manifests when sub-agents need context.
