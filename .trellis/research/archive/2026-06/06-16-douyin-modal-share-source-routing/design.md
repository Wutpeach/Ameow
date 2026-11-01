# Design: Douyin Modal Share Source Routing

## Current Behavior

`src/sites/douyin.ts` currently:

- accepts `/video/{id}`, `/note/{id}`, and `/gallery/{id}` page sources;
- extracts `modal_id` from SPA/modal URLs;
- synthesizes extracted ids with `https://www.douyin.com/{kind}/{id}`;
- falls back to the original URL when no accepted source or synthesis is available.

This makes `jingxuan?modal_id=...` become a bare `www.douyin.com/video/{id}` source for douyin-dl.

## Proposed Behavior

When a Douyin content id must be synthesized from modal/query/capture id evidence, build a share-style source:

```text
https://www.iesdouyin.com/share/video/{id}/
```

Keep already accepted content page sources unchanged:

```text
https://www.douyin.com/video/{id}
https://www.douyin.com/note/{id}
https://www.douyin.com/gallery/{id}
```

Keep short links unchanged:

```text
https://v.douyin.com/...
```

Rationale:

- douyin-dl already has a short-link flow that resolves to `iesdouyin.com/share/video/...`.
- The share URL is still a douyin-dl page source, not a provider-side extraction bypass.
- It preserves user-visible intent while giving douyin-dl an entry closer to the native share-link route.

## Source Priority

Provider source selection should stay ordered through `resolveCaptureSourceUrl(...)`:

1. Accepted capture/source candidates:
   - `/video/{id}`;
   - `/note/{id}`;
   - `/gallery/{id}`;
   - direct media URLs.
2. Synthesized source from evidence:
   - share-style URL for `video` ids found through modal/query/capture id fallback;
   - existing `note`/`gallery` accepted paths if a non-video kind is explicitly detected from an accepted source.
3. Fallback:
   - `pageUrl ?? url`.

Short links should not be treated as accepted sources in the provider. They should remain fallback/raw input so douyin-dl runs its native short-link resolver.

## Host Compatibility

Add `iesdouyin.com` to Douyin host recognition because the synthesized source and short-link resolution target are Douyin-owned share pages. This affects provider matching/source acceptance only; it does not create a new engine.

## Tests

Provider tests should cover:

- `jingxuan?modal_id=...` produces `https://www.iesdouyin.com/share/video/{id}/`.
- Existing `/video/{id}` input remains `https://www.douyin.com/video/{id}`.
- Existing `/note/{id}` and `/gallery/{id}` path kinds remain preserved.
- `v.douyin.com/...` remains passed through as the source URL.
- Capture evidence accepted URL priority still wins over synthesized modal id.

Focused runtime tests should continue to cover service dispatch and douyin-dl artifact handling.

## Rollback

Rollback is localized to `src/sites/douyin.ts` and provider tests:

- restore modal id synthesis to `https://www.douyin.com/video/{id}`;
- remove `iesdouyin.com` host recognition if no longer used.
