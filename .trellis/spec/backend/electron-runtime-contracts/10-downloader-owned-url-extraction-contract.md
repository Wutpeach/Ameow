## Scenario: Downloader-Owned URL Extraction Contract

### 1. Scope / Trigger

- Trigger: Any task that changes pasted/drop video URL normalization, provider routing, or engine `sourceUrl` selection for Electron-owned video downloads.
- Why this needs code-spec depth: URL handling crosses renderer paste/drop input, Electron command normalization, runtime provider routing, and sidecar downloader execution. App-side URL rewrites can silently remove extractor-required query parameters or mask downloader behavior.

### 2. Signatures

Queue normalization boundary:

```ts
normalizeQueueVideoDownloadRequest(payload: CommandPayload): QueuedVideoDownloadRequest
```

Provider routing boundary:

```ts
SiteRegistry.resolve(input: RawDownloadInput): ResolvedDownloadPlan | null
```

Key files:

```txt
src/electron-runtime/commandRouter.ts
src/electron-runtime/service.ts
electron/videoHintNormalization.mts
src/sites/weibo.ts
src/sites/gallery-dl-support.ts
src/sites/xiaohongshu.ts
```

### 3. Contracts

- Electron video downloads must not perform runtime-owned short-link expansion before provider resolution. No HEAD/GET redirect probes, hidden-window navigation, or wrapper-query unwrapping may run in `src/electron-runtime/service.ts`.
- Queue normalization may trim and validate HTTP(S) URLs, reject unsafe schemes, normalize optional metadata, and infer `siteHint` from the provided values.
- Provider routing may inspect host/path enough to choose a downloader engine, but downloader sidecars own redirects, wrapper pages, and extractor-specific page interpretation.
- `normalizeVideoPageUrl(...)` must preserve valid URL path/query variants such as X `/status/<id>/photo/<n>` instead of rewriting them to a different page shape.
- Xiaohongshu remains the explicit compatibility exception: video downloads must pass a yt-dlp-compatible canonical note URL and preserve `xsec_token` query parameters when already present.
- Weibo-specific routing contract:
  - `weibo.com/detail/...`, `status/...`, and `layerid`-style URLs stay `gallery-dl`-first
  - `weibo.com/tv/show/...` must not be routed to `gallery-dl` primary, because `gallery-dl` rejects those URLs as unsupported
  - wrapper URLs such as `passport.weibo.com/visitor?...url=...` may route by explicit `siteHint`, but the wrapper URL should be passed through to the downloader rather than unwrapped by the app
- Renderer drag/drop image downloads should pass `pageUrl` when the dragged image URL came from a host page context, so Electron main can derive `Referer` for hotlink-sensitive image hosts such as `sinaimg.cn`.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Pasted URL is `blob:`, `data:`, `file:`, `javascript:`, or non-HTTP(S) | command normalization | Reject before queueing | Keep safety validation |
| Pasted URL is a short-link host such as `t.cn`, `b23.tv`, `pin.it`, or `xhslink.com` | runtime execution context | Runtime passes the URL to the selected/provider-generic downloader without pre-expanding it | Let downloader follow redirects |
| Wrapper URL contains a usable `url=` target | provider/engine execution context | App keeps the wrapper URL unless a provider has a documented downloader-compatibility exception | Let downloader parse or fail with its native error |
| Valid X `/status/<id>/photo/<n>` page URL enters video queue | `normalizeVideoPageUrl(...)` | Preserve the full URL | Let yt-dlp interpret the variant |
| Xiaohongshu note URL carries `xsec_token` | `src/sites/xiaohongshu.ts` | Preserve query parameters in the yt-dlp source URL | Keep compatibility canonicalization |
| Dragged Sina image URL is valid but host requires referer | `download_image` flow | Renderer passes `pageUrl`, Electron derives `Referer`/`Origin`, image download succeeds | Preserve page context on image drags |

### 5. Good / Base / Bad Cases

- Good:
  - Pasting `http://t.cn/...` queues the short URL directly through generic `yt-dlp` when no provider can identify the destination from the visible URL.
  - Pasting a direct `passport.weibo.com/visitor?...url=...` wrapper with `siteHint: "weibo"` keeps the wrapper URL as the engine source.
  - Dragging a `wx*.sinaimg.cn/...jpg` image from a page sends the image URL plus source page URL so Electron main can fetch it with a valid referer.
- Base:
  - Provider matching still chooses Douyin, Xiaohongshu, Bilibili, Twitter/X, Weibo, gallery-dl-supported, or generic based on available host hints.
  - Queue normalization still rejects unsafe schemes before a subprocess can receive them.
- Bad:
  - Runtime opens a hidden window or sends HEAD/GET probes to expand a pasted video URL before provider resolution.
  - App canonicalizes X `/photo/<n>` overlays to status URLs before handing them to yt-dlp.
  - App strips `xsec_token` from a Xiaohongshu canonical note URL.
  - `weibo.com/tv/show/...` is still routed to `gallery-dl` primary.
  - Dragged hotlink-sensitive image URLs lose their `pageUrl`, so `download_image` runs without the expected referer context.

### 6. Tests Required (with assertion points)

- `npm run type-check`
- `npm run test -- src/electron-runtime/service.test.ts`
  - runtime passes short links through without calling environment fetch for pre-resolution
  - runtime passes Weibo visitor wrappers through to downloader engines when routed by `siteHint`
- `npm run test -- src/sites/providers.test.ts`
  - `weibo.com/tv/show/...` plans resolve to `yt-dlp`
  - direct visitor wrappers are preserved as downloader source URLs
  - Xiaohongshu tokenized note URLs preserve `xsec_token`
- `npm run test -- electron/videoHintNormalization.test.mts`
  - valid X `/photo/<n>` URLs are preserved
- Manual assertions (Electron dev):
  - paste a real short link and confirm Electron runtime no longer logs pre-engine expansion
  - drag a real `wx*.sinaimg.cn/...jpg` image and confirm image save succeeds

### 7. Wrong vs Correct

#### Wrong

```ts
activeTask.request = await expandShortLinkBeforeProviderResolution(activeTask.request);
```

#### Correct

```ts
const resolvedPlan = this.siteRegistry.resolve(activeTask.request);
```

Why wrong:
- Runtime-side pre-resolution duplicates downloader extraction, adds latency, and can remove extractor-required query parameters.
- It hides the actual URL received by sidecar engines, making downloader failures harder to reproduce with direct CLI commands.
