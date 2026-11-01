# Context-Aware Toolbar Auto Media Scan Design

## Objective

Replace the fixed three-tab popup console with a context-aware toolbar hub that opens directly into the active page's current state. The popup should quickly show whether Ameow is connected, whether the in-page launcher is usable, and what video/audio/image resources were found by an automatic bounded scan.

## Relationship To Existing Popup Task

The existing `05-24-extension-popup-console-media-browser` task implemented/planned:

- fixed `Browse / Controls / Sites` top-level tabs;
- manual `Scan current page`;
- `Video / Image` filters only.

This task intentionally changes those requirements. The new model keeps the useful parts of the existing implementation, such as compact rows, bounded scan cache, row action menus, launcher controls, and hidden-site restore behavior, but changes the information architecture and scan trigger.

## Product Layout

The popup is a compact context hub. It should not start with a large tab bar.

Default connected and launcher-visible shape:

```text
+----------------------------------+
| Ameow                      ● On  |
| Extension                        |
+----------------------------------+

+----------------------------------+
| youtube.com                      |
| Launcher active                  |
| Auto scanned just now            |
| 8 video · 3 audio · 14 image     |
+----------------------------------+

+----------------------------------+
| [ Video ] [ Audio ] [ Image ]    |
+----------------------------------+

+----------------------------------+
| [VID] title.mp4              ... |
|       youtube · 1080p · mp4      |
+----------------------------------+

+----------------------------------+
| Quality                      >   |
+----------------------------------+
| Launcher position            >   |
+----------------------------------+
| Hidden sites (2)             >   |
+----------------------------------+
```

Launcher hidden shape:

```text
+----------------------------------+
| Ameow                      ● On  |
| Extension                        |
+----------------------------------+

+----------------------------------+
| youtube.com                      |
| Launcher hidden on this site     |
| [ Restore launcher ] [ Refresh ] |
+----------------------------------+

+----------------------------------+
| [ Video ] [ Audio ] [ Image ]    |
+----------------------------------+
```

Desktop offline shape:

```text
+----------------------------------+
| Ameow                   ● Offline|
| Extension                        |
+----------------------------------+

+----------------------------------+
| Desktop app not connected        |
| Open Ameow desktop to download.  |
| Media can be inspected, but      |
| downloads require the app.       |
+----------------------------------+
```

Restricted page shape:

```text
+----------------------------------+
| chrome://extensions              |
| Extension cannot scan this page  |
| Open a normal website to capture |
| media resources.                 |
+----------------------------------+
```

## State Model

The hub card is derived from:

- desktop connection state: `connected`, `connecting`, `offline`;
- active tab accessibility: `scannable`, `restricted`, `missing_content_script`, `timeout`;
- launcher state: `visible`, `hidden_here`, `disabled_global`, `unavailable`;
- scan state: `idle`, `cached`, `scanning`, `fresh`, `empty`, `failed`;
- selected media type: `video`, `audio`, `image`.

The popup should render a stable shell immediately, then update state as async responses arrive. Avoid a blank popup while waiting for scan or launcher ping.

## Auto-Scan Behavior

Opening the popup starts one scan for the active tab if:

- the page is not a restricted browser page;
- content-script messaging is available or can be routed through the background;
- the current URL is not already being scanned for this popup session.

Recommended sequence:

1. Resolve active tab and URL.
2. Render header and context card from cached launcher/status info if available.
3. Load fresh same-URL scan cache when present and display it with a timestamp.
4. Start a refresh scan in the background.
5. Replace cached results when the refresh scan completes.
6. Show a compact failure state on timeout or restricted pages.

Constraints:

- keep first meaningful render under roughly 200 ms when cached state exists;
- cap scan duration around 3-5 seconds;
- cap total candidates, for example 100 total resources;
- dedupe by normalized URL plus media type;
- cache results by active tab id plus URL hash;
- when reading cache, verify the stored `pageUrl` still matches the active tab URL;
- reject cache entries from a different tab id or different URL hash to avoid cross-tab pollution;
- invalidate or ignore cache when active tab URL changes;
- track in-flight scans for the same tab id plus URL hash so rapid popup close/reopen does not start duplicate concurrent scans;
- skip auto-scan before messaging content scripts on restricted browser pages such as `chrome://`, `chrome-extension://`, `edge://`, and `about:`;
- never send unbounded DOM snapshots or large media blobs.

The visible action should become `Refresh`, not the primary first-run `Scan`.

## Media Candidate Contract

Extend the candidate type to include audio:

```ts
type MediaType = "video" | "audio" | "image";

type MediaCandidate = {
  id: string;
  mediaType: MediaType;
  url: string;
  title?: string;
  host?: string;
  extension?: string;
  mimeType?: string;
  source:
    | "video_element"
    | "audio_element"
    | "source_element"
    | "img_element"
    | "picture_source"
    | "direct_link"
    | "open_graph"
    | "performance_resource";
  width?: number;
  height?: number;
  duration?: number;
};
```

Candidate extraction sources:

- Video:
  - `video[src]`;
  - `video source[src]`;
  - direct links/resources with video extensions or MIME types;
  - Open Graph video metadata.
- Audio:
  - `audio[src]`;
  - `audio source[src]`;
  - direct links/resources with audio extensions or MIME types, such as `mp3`, `m4a`, `aac`, `wav`, `ogg`, `flac`;
  - performance resources with audio MIME hints when available.
  - exclude known short UI sounds when duration is known and below 5 seconds;
  - exclude playlist or segment-like shapes such as `m3u8`, `mpd`, `m4s`, and `ts` unless a later provider-specific reason reintroduces them;
  - prefer stable direct audio files over transient streaming chunks.
- Image:
  - visible `img[src]` above the established size threshold;
  - `picture/source`;
  - direct image links/resources;
  - Open Graph image metadata.

Do not add `All` or `Link` as user-facing filters. Links remain metadata/source forms.

## UI Rules

- Header status pill is the single persistent connection signal.
- The context card owns immediate page state and resource counts.
- Media filters use a three-way segmented control: `Video / Audio / Image`.
- Row actions stay behind the row menu.
- When desktop is offline, media can still be inspected if scanning works, but download actions should clearly report that the desktop app is required.
- `Download this page` appears in the context card only as a muted secondary fallback when the launcher is unavailable or hidden. If `Restore launcher` is present, restore is visually primary. Restricted browser pages should not show the fallback when the page URL itself is not useful to download.
- Settings sections are collapsed below the media browser:
  - `Quality`;
  - `Launcher position`;
  - `Hidden sites`.
- Avoid nested cards. Use compact rows/disclosures rather than tabbed dashboards.
- Use existing Ameow extension tokens and surface recipes where practical.

## Compatibility

- Keep existing launcher quick actions as the normal page-level download path.
- Keep existing injected site buttons unchanged.
- Keep existing context-menu/right-click code unchanged.
- Preserve current candidate row actions and direct download request path where possible.
- Existing manual scan cache logic can be adapted into auto-scan plus refresh.

## Risks

- Auto-scan may make popup open feel slow if the scan path blocks shell render.
- Audio detection may surface many small UI sounds or streaming chunks. Filters should prefer meaningful audio files and dedupe aggressively.
- Performance resource scanning can be noisy on media-heavy sites. Candidate caps and extension/MIME filters are required.
- Context-aware layout can feel unpredictable if anchor positions move too much. Header, context card, media filter, and disclosure rows should remain stable.
- Chrome popup lifetime can interrupt scans. The scan should be cancellable or harmless if the popup closes.

## Claude Review Integration

Claude reviewed the first draft and recommended tightening four areas:

- cache scoping: use tab id plus URL hash, and compare stored `pageUrl` on read;
- audio noise: define extension/MIME whitelist, duration threshold, and fragment exclusions before coding;
- fallback placement: keep `Download this page` in the context card as secondary to launcher restore;
- auto-scan guardrails: pre-check restricted URLs, avoid duplicate in-flight scans, and render a cold scanning state quickly.

These points are now part of the task requirements and implementation plan.
