# Route Douyin modal links through share source

## Goal

Improve Douyin `jingxuan?modal_id=...` and similar modal-link download behavior by routing douyin-dl through a share-style source URL instead of a bare `www.douyin.com/video/{id}` URL when the original user link only provides an extracted content id.

## Background Evidence

The parent latency investigation found:

- Ameow runtime overhead is negligible.
- `jingxuan?modal_id=7644506999371437489` currently synthesizes `https://www.douyin.com/video/7644506999371437489`.
- `v.douyin.com/P1WL6bqF2SA/` resolves to `https://www.iesdouyin.com/share/video/7644506999371437489/?...&from_aid=6383&from=web_code_link`.
- douyin-dl has dedicated short-link handling: it resolves short links first, then parses the resolved share URL.
- In small benchmark samples, `www.iesdouyin.com/share/video/{id}/` and the full short-link resolved share URL completed with lower and more stable median times than the bare `/video/{id}` route, while all paths still showed some CDN variance.
- The likely issue is not unsupported modal links, but that Ameow's synthesized bare `/video/{id}` source may skip share-link session/redirect context that helps douyin-dl or Douyin choose a faster media path.

## Requirements

- For Douyin modal/content-id-only inputs such as `https://www.douyin.com/jingxuan?modal_id=7644506999371437489`, use a share-style source URL for douyin-dl.
- Preserve existing support for:
  - `https://v.douyin.com/.../` short links;
  - existing `/video/{id}`, `/note/{id}`, and `/gallery/{id}` accepted page sources;
  - direct Douyin media URLs;
  - capture evidence that already provides a provider-owned accepted source.
- Keep `intent.originalUrl` as the user's original URL for diagnostics and UI context.
- Do not modify douyin-dl package pin, fork upstream, or bypass douyin-dl extraction.
- Do not add permanent broad runtime child-output logging.
- Add or update provider tests so the routing behavior is explicit and protected.
- Validate that the new source route still produces compatible douyin-dl summary, manifest, and media output.

## Acceptance Criteria

- [ ] Douyin `jingxuan?modal_id=...` plans `douyin-dl` with `https://www.iesdouyin.com/share/video/{id}/` or an equivalent share-style source.
- [ ] Douyin short links remain passed through as the original short URL so douyin-dl keeps its own short-link resolution path.
- [ ] Existing accepted `/video/{id}`, `/note/{id}`, and `/gallery/{id}` sources remain accepted without being rewritten to share URLs.
- [ ] Capture evidence priority remains intact: accepted evidence sources still win over synthesized fallback.
- [ ] `intent.originalUrl`, `intent.pageUrl`, and diagnostics still preserve the user/browser URL.
- [ ] Focused provider/runtime tests pass.
- [ ] Benchmark or smoke validation confirms the new source route downloads the target video and keeps manifest/artifact compatibility.

## Out Of Scope

- UI progress mapping changes.
- Upstream douyin-dl package pin changes.
- Forking or patching douyin-dl.
- Provider-side media extraction bypassing douyin-dl.
- Long-lived support-log schema changes.
