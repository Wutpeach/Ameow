# Design: Weibo popup API variant options

## Architecture

Add a Weibo-specific page bridge that mirrors the existing Xiaohongshu page-bridge pattern, but keeps its output limited to Weibo video variant metadata.

New or changed browser-extension layers:

- `weibo-page-bridge.js`
  - injected into the page main world;
  - wraps page `fetch` and `XMLHttpRequest`;
  - inspects cloned JSON/text responses from Weibo-related API URLs;
  - recursively extracts direct `.mp4` / `.m3u8` variants and nearby quality metadata;
  - posts sanitized variant records to the extension isolated world.
- `weibo-variant-parser.js`
  - keeps existing DOM script parsing;
  - listens for Weibo bridge messages in the content script context or reads a shared cache;
  - merges observed API variants with DOM-derived variants;
  - keeps the existing grouped candidate shape.
- `manifest.json`
  - exposes `weibo-page-bridge.js` as a web-accessible resource;
  - adds an early Weibo-only content-script injector, or reuses an existing generic early injector if suitable.
- `popup.js`
  - should need minimal or no production changes if grouped candidates contain `variants[]`;
  - may need test-only exports or stronger tests for selector rendering.

## Data Flow

```text
Weibo page loads
  -> document-start Weibo injector adds weibo-page-bridge.js to the page
  -> page bridge observes page-owned fetch/XHR responses
  -> bridge extracts bounded sanitized video variant records
  -> bridge posts records to the content script
  -> weibo-variant-parser cache stores observed records
  -> popup scan asks generic detector for media candidates
  -> parser returns one grouped Weibo candidate with merged variants
  -> popup renders one row with a quality selector
  -> selected variant continues through selectedVideoVariant
```

## Contracts

Observed variant records should use the existing variant shape where possible:

- `url`
- `label?`
- `type`
- `source: "weibo_api_observer"` or compatible source
- `confidence: "high"`
- `mediaType: "video"`
- `qualityIndex?`
- `width?`
- `height?`
- `bitrate?`

The grouped candidate contract remains:

- `source: "site_extractor"`
- `type: "weibo_variants"`
- `siteHint: "weibo"`
- `groupId`
- `canonicalId`
- `variants`
- `preferredVariantUrl`
- `preferredVariantLabel`

## Compatibility

- Existing DOM script variant extraction must keep working.
- Existing no-variant Weibo fallback must keep working.
- Popup rendering should remain generic and resource-scoped; avoid adding a Weibo-only UI branch unless tests show the generic path is insufficient.
- Browser-native fallback for selected direct variants remains allowed when desktop is offline or submission fails recoverably.
- Desktop-online selected variants keep the explicit `selectedVideoVariant` route.

## Safety

- Do not post whole API responses from the page bridge.
- Bound recursion, total nodes, total variants, and string sizes.
- Restrict bridge response inspection to Weibo hosts and Weibo-like response URLs.
- Ignore malformed JSON and unsupported response types.
- Use `response.clone()` for fetch so the page receives the original response unchanged.
- For XHR, inspect only text/empty response types after load.

## Trade-Offs

- A page bridge can observe runtime metadata that an isolated content script cannot see, but it may miss requests that completed before injection.
- Document-start injection improves coverage but adds one more web-accessible script. Restricting it to Weibo hosts keeps the blast radius narrow.
- Staying non-proactive preserves the prior product constraint, but cannot recover variants if Weibo does not expose them to the active session.
