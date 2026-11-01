# Extension Popup Console And Media Browser Design

## Objective

Promote the browser toolbar popup from a narrow status widget into a compact command console without turning it into a cluttered dashboard. Phase 3 completes launcher recovery and hidden-site management. Phase 4 adds a popup-local media browser for explicitly scanning the active page for video and image candidates.

## Product Shape

The approved UI model is Scheme A from the design review:

- Popup: primary control surface, 320-340px wide.
- Launcher: quick in-page extension of popup actions.
- Advanced media browser: inside the popup `Browse` tab.

The popup uses tabs to hide complexity rather than putting every control on screen at once. Visible rows should communicate with icons, badges, compact labels, and status dots. Detailed actions live behind row menus.

## Popup Layout

Top-level structure:

```text
Ameow                         connected dot

[ Browse ] [ Controls ] [ Sites ]

<active tab content>
```

The popup always opens to `Browse`. It does not persist the last selected tab.

### Browse Tab

Purpose: manual current-page media scan.

Structure:

```text
[ Video ] [ Image ]

[ Scan current page ]

<results / scanning / empty / error state>
```

Rules:

- No automatic scan on popup open.
- No `All` sub-tab.
- No `Link` sub-tab.
- Links are represented as `source` metadata on video/image candidates.
- The first implementation should prefer clear lists over thumbnails unless thumbnail generation is cheap and bounded.
- Candidate list is scrollable inside the popup.

Candidate row visible fields:

- type icon or badge;
- short title / filename;
- host and source form, such as `video tag`, `direct link`, `og:video`, `img tag`, or `direct image link`;
- compact state if needed, such as copied, queued, failed, stale.

Candidate row actions:

- one visible `...`/more icon;
- menu items:
  - Download;
  - Copy link;
  - View source.

### Controls Tab

Purpose: global and current-site launcher controls.

Recommended content:

- desktop connection state;
- quality preference;
- launcher enabled toggle;
- current-site state line, such as visible / hidden here / unavailable;
- restore current site when hidden;
- left/right side segmented control;
- reset launcher position.

The Controls tab should not duplicate the full hidden-site list. It may show a compact hint such as hidden-site count with a link to `Sites`.

### Sites Tab

Purpose: hidden-site management.

Recommended content:

- hidden-site count;
- scrollable hidden host list;
- per-row restore icon/action;
- restore-all action with confirmation or guarded interaction.

The list should prefer hostnames over raw patterns in visible UI. If a stored pattern is not a hostname, show a compact pattern badge.

## Launcher Role

The launcher remains a compact page-edge quick entry.

Keep in launcher:

- pick download;
- download current content;
- connection/status coloring;
- compact feedback;
- drag/reposition if already available;
- lock if already available;
- hide on this site;
- switch side if it remains cheap and discoverable.

Do not move into launcher:

- hidden-site list;
- restore all;
- media candidate browser body;
- long-form settings.

The launcher may include a More menu entry later to hint that more controls exist in the popup, but the popup cannot be reliably opened from the content script as a core user path. Treat the browser toolbar popup as user-opened.

## Media Scan Model

The popup requests an active-tab scan through the extension messaging layer. The preferred shape is:

```text
popup -> background -> active tab content script -> background -> popup
```

This keeps routing, permissions, caching, and failure states centralized.

Candidate fields should stay small:

```ts
type MediaCandidate = {
  id: string;
  mediaType: "video" | "image";
  url: string;
  title?: string;
  host?: string;
  extension?: string;
  source: "video_element" | "source_element" | "img_element" | "picture_source" | "direct_link" | "open_graph" | "performance_resource";
  width?: number;
  height?: number;
  confidence?: "high" | "medium" | "low";
};
```

Do not send unbounded DOM snapshots or large thumbnail data in MVP. Cap and deduplicate candidates.

Recommended scan behavior:

- max 100 candidates total;
- dedupe by normalized URL;
- ignore tiny images below a threshold such as 100x100;
- timeout around 5 seconds;
- cache the most recent active-tab scan result with a short TTL, such as 60 seconds;
- show stale/expired state rather than pretending old results are fresh.

## Storage And State

Use existing launcher config as the source for launcher enabled/side/vertical position/hidden sites unless implementation review finds it too coupled. Add dedicated message handlers so the popup does not need to rewrite unrelated config fields.

Relevant operations:

- get launcher config/status;
- set launcher enabled;
- restore current site;
- restore hidden site by host/pattern;
- restore all hidden sites;
- set side;
- reset position to default.

Media scan cache can live in `chrome.storage.local` under a bounded key, keyed by active tab and URL hash. Clean stale entries on tab navigation/removal when practical.

## Compatibility

- Existing injected buttons stay untouched.
- Existing context-menu/right-click code stays untouched.
- Current launcher actions should continue to work while popup tabs are added.
- Restricted browser pages should return a compact unavailable state.

## UI Risks

- Popup closes on blur, so scan state must be recoverable or cached.
- Long candidate lists can make the popup feel heavy; cap, dedupe, and avoid large previews.
- Row actions can clutter the list; keep only one row menu visible.
- Quality selection already appears in launcher in current local code. If retained, it must stay synchronized with popup storage changes.

