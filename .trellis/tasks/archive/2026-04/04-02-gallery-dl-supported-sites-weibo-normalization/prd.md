# Prefer gallery-dl Supported Sites and Normalize Weibo URLs

## Goal
Route gallery-dl-supported sites through `gallery-dl` before `yt-dlp`, and normalize commonly copied Weibo URLs into the canonical `https://weibo.com/detail/<status-id>` form that `gallery-dl` can extract.

## Requirements
- Preserve existing site-specific routing where the app already has a dedicated provider or a verified direct-download flow.
- Add a provider layer for gallery-dl-supported sites that currently fall through to the generic `yt-dlp` route.
- Normalize Weibo URLs before building a gallery-dl engine plan so pasted `?layerid=...` links and compatible Weibo page URLs resolve to `https://weibo.com/detail/<status-id>`.
- Keep `yt-dlp` as a fallback when the gallery-dl attempt fails for a supported site.
- Add provider-level tests for gallery-dl-supported routing and Weibo normalization behavior.

## Acceptance Criteria
- [ ] A gallery-dl-supported site that is not already handled by a dedicated provider resolves to a `gallery-dl` primary engine plan with `yt-dlp` fallback.
- [ ] Existing dedicated providers such as YouTube, Bilibili, Douyin, Xiaohongshu, Twitter/X, and Pinterest keep their current primary routing behavior.
- [ ] `https://weibo.com/?layerid=<status-id>` resolves to a gallery-dl engine plan whose source URL is `https://weibo.com/detail/<status-id>`.
- [ ] Compatible Weibo page URLs are normalized consistently and invalid/non-resolvable Weibo URLs fall back safely without throwing during planning.
- [ ] Unit tests cover the new provider match rules and Weibo URL normalization paths.

## Technical Notes
- Use the local `gallery-dl --list-extractors` output as the source for supported-host routing heuristics.
- Keep the host allowlist and Weibo normalization in shared site-provider utilities instead of duplicating regex logic across files.
