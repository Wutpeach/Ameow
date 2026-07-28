# Design: Extensible site-specific video variant parsing

## Architecture

Introduce a browser-extension parser layer that augments, but does not replace, the existing generic scanner.

Proposed layers:

- Site parser modules:
  - one file per supported site, starting with `browser-extension/weibo-variant-parser.js`;
  - pure extraction helpers exported through a test hook/global namespace;
  - no desktop transport ownership.
- Parser registry:
  - small shared module such as `browser-extension/site-video-parser-registry.js`;
  - chooses applicable parsers by current page URL/host;
  - returns normalized site candidates to the generic scan response.
- Candidate model extension:
  - keep existing fields: `url`, `pageUrl`, `title`, `type`, `source`, `mediaType`, `previewUrl`;
  - add optional grouping fields:
    - `groupId`
    - `canonicalId`
    - `variants`
    - `preferredVariantUrl`
    - `preferredVariantLabel`
    - `siteHint`
  - preserve backward compatibility by making all new fields optional.
- Popup grouping:
  - teach existing `mergeDisplayCandidates(...)` to recognize `variants[]` and explicit `groupId`;
  - render one logical resource for a grouped Weibo candidate;
  - keep preview based on current playable/direct candidate when present.
- Download routing:
  - grouped Weibo desktop candidate should use the canonical page/detail URL and `siteHint: "weibo"` by default;
  - a direct variant may remain available as a browser fallback or source/copy target.

## Weibo Extraction Strategy

The Weibo parser should start with low-risk page-local extraction:

- inspect inline script text for JSON-shaped state containing known video fields;
- recursively scan bounded parsed objects for variant-like entries;
- detect keys observed in upstream/gallery-dl evidence such as `playback_list`, `media_info`, `quality_index`, direct stream URLs, and labels;
- normalize candidate URLs through existing generic URL normalization;
- rank variants by `quality_index`, then height/width/bitrate when present;
- generate a stable group key from status id, object id, page canonical/detail URL, or a hash fallback.

If page-local extraction is insufficient, later implementation may add a bounded background fetch to same-origin Weibo API endpoints, but it should remain behind the Weibo parser boundary and be tested separately.

## Data Flow

```text
Weibo page
  -> content script generic scan
  -> site parser registry runs Weibo parser
  -> generic scan result gains grouped site candidate
  -> background merges scan result with network cache
  -> popup groups/render candidates
  -> download action sends page-backed Weibo candidate to desktop by default
  -> desktop Weibo provider/gallery-dl resolves highest available quality
```

## Compatibility

- Existing one-URL candidates must continue to render and download unchanged.
- Existing media scan cache should tolerate new optional fields.
- Existing `normalizeVideoCandidates(...)` currently drops fields outside the basic candidate contract. If grouped candidates need to cross the background-to-desktop boundary as variants, normalization must explicitly preserve bounded variant fields.
- Desktop backend does not need to understand every variant in the first version if default grouped download uses the canonical Weibo page URL.

## Trade-Offs

- A site parser can discover variants the generic scanner cannot, but it depends on Weibo's page state and can break when Weibo changes.
- Defaulting grouped Weibo downloads to desktop page extraction is more robust than direct variant URL downloading, but it means popup quality choice may not fully control gallery-dl.
- Adding a first-class variant picker improves user control but increases popup UI and payload complexity. A collapsed best-only MVP is simpler and still fixes the highest-quality download path from the popup.

## Validation

- Unit tests should use static Weibo-like fixtures and avoid live Weibo network dependencies.
- Popup tests should assert row grouping and metadata display, not pixel-perfect visual layout.
- Background tests should assert grouped candidate download payloads preserve page URL, site hint, and selected/direct fallback where applicable.
