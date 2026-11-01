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
  - add a bounded selected-variant payload field for strict user choices, tentatively `selectedVideoVariant`.
  - preserve backward compatibility by making all new fields optional.
- Popup grouping:
  - teach existing `mergeDisplayCandidates(...)` to recognize `variants[]` and explicit `groupId`;
  - render one logical resource for a grouped Weibo candidate;
  - keep preview based on current playable/direct candidate when present.
- Popup quality selector:
  - Phase 2 adds a resource-scoped variant selector for grouped candidates;
  - the selector is a compact inline dropdown or segmented menu inside the grouped resource row;
  - variants are not expanded into separate top-level popup rows;
  - the selector should be backed by the same generic `variants[]` model used by Weibo so future site parsers do not need a custom UI path.
- Download routing:
  - grouped Weibo desktop candidate should use the canonical page/detail URL and `siteHint: "weibo"` by default;
  - in Phase 1, default grouped downloads use the highest-quality reliable route;
  - in Phase 2, a user-selected Weibo variant strictly controls the main download action;
  - strict selected-variant intent should be represented explicitly, not inferred from ordinary direct media hints;
  - pasted Weibo links remain page/link based and keep desktop `gallery-dl` highest-quality extraction.

## Weibo Extraction Strategy

The Weibo parser should start with low-risk page-local extraction:

- inspect inline script text for JSON-shaped state containing known video fields;
- recursively scan bounded parsed objects for variant-like entries;
- detect keys observed in upstream/gallery-dl evidence such as `playback_list`, `media_info`, `quality_index`, direct stream URLs, and labels;
- normalize candidate URLs through existing generic URL normalization;
- rank variants by `quality_index`, then height/width/bitrate when present;
- generate a stable group key from status id, object id, page canonical/detail URL, or a hash fallback.

Phase 1 must not add proactive Weibo API requests. If page-local extraction is insufficient on real pages, a later enhancement may add a bounded same-origin Weibo API probing path behind the Weibo parser boundary.

## Data Flow

Phase 1:

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

Phase 2:

```text
Grouped popup row
  -> user opens compact inline quality selector
  -> selected variant is stored on the display candidate
  -> Weibo defaults selector state to the highest detected variant
  -> copy/source/browser fallback actions use the selected variant URL
  -> main download action sends explicit selectedVideoVariant intent
  -> desktop runtime routes the selected Weibo variant strictly instead of treating it as a passive currentSrc hint
  -> selected-variant download failures report a selected-quality error and do not silently fall back to another quality
  -> if desktop is online, the selected variant stays in the desktop queue/output-folder workflow
  -> desktop-queued selected variants run through the existing compatibility probe/remux/transcode flow
  -> if desktop is offline or the connection fails recoverably, selected direct variants may use browser-native download fallback
  -> pasted Weibo link downloads bypass this selector and keep gallery-dl page extraction
```

## Compatibility

- Existing one-URL candidates must continue to render and download unchanged.
- Existing media scan cache should tolerate new optional fields.
- Existing `normalizeVideoCandidates(...)` currently drops fields outside the basic candidate contract. If grouped candidates need to cross the background-to-desktop boundary as variants, normalization must explicitly preserve bounded variant fields.
- The raw download input schema will need a bounded selected-variant shape so renderer/extension/runtime code can type-check strict variant intent.
- Desktop backend does not need to understand every variant in the first version if default grouped download uses the canonical Weibo page URL.
- Phase 2 should not make the global `best` / `balanced` / `data_saver` selector ambiguous. The grouped-row selector is resource-specific and applies only to variants discovered for that resource.
- The strict selected-variant behavior applies to extension-discovered Weibo grouped resources, not pasted Weibo links.
- A failed strict selected-variant download must not silently fall back to `gallery-dl` page extraction because that can download a different quality than the user chose.
- Browser-native download fallback remains valid for selected direct variants when the desktop app is offline or the desktop connection fails recoverably; these downloads will not enter the desktop queue/output-folder/post-processing workflow.
- When the desktop app is online, selected Weibo variants should prefer the desktop queue so they keep Ameow's output-folder, queue, naming, and post-processing behavior where applicable.
- Desktop-queued selected Weibo variants should reuse the existing compatibility probe/remux/transcode path. Weibo variants are expected to usually land as MP4 and skip extra processing when compatible.
- Selector copy should follow the existing popup localization style: short labels, English and Simplified Chinese locale updates together, and no explanatory in-app paragraphs.

## Trade-Offs

- A site parser can discover variants the generic scanner cannot, but it depends on Weibo's page state and can break when Weibo changes.
- Defaulting grouped Weibo downloads to desktop page extraction is more robust than direct variant URL downloading, but it means popup quality choice may not fully control gallery-dl.
- Adding a first-class variant picker improves user control but increases popup UI and payload complexity. The task will handle this as Phase 2 after the grouped candidate model is stable.

## Phasing

### Phase 1: Parser and Grouped Best Default

- Add parser registry and Weibo parser.
- Use page-local extraction only; no proactive Weibo API fetches.
- Extend candidate schema with optional grouping and variants.
- Render one grouped Weibo row with highest quality/variant count metadata.
- Default download to the highest-quality reliable route.
- Preserve fallback behavior.

### Phase 2: Resource-Scoped Quality Selector

- Add a compact inline dropdown or segmented menu to grouped resource rows.
- Keep selector state per grouped row.
- Route copy/source/direct fallback actions to the selected variant.
- Route Weibo grouped main downloads through an explicit selected-variant payload field.
- Teach desktop runtime/provider routing to distinguish explicit selected variants from passive direct media hints.
- Surface selected-variant failures as selected-quality errors rather than falling back to another quality.
- Preserve desktop-first routing for selected variants when the desktop app is online.
- Reuse the existing desktop compatibility probe/remux/transcode flow for desktop-queued selected variants.
- Preserve browser-native fallback for selected direct variants when the desktop app is offline or connection submission fails recoverably.
- Preserve pasted Weibo link downloads on the existing gallery-dl highest-quality route.
- Keep the selector generic for future grouped parser candidates.

## Validation

- Unit tests should use static Weibo-like fixtures and avoid live Weibo network dependencies.
- Popup tests should assert row grouping and metadata display, not pixel-perfect visual layout.
- Background tests should assert grouped candidate download payloads preserve page URL, site hint, and selected/direct fallback where applicable.
