# Xiaohongshu download failure investigation

## Goal

Restore successful Xiaohongshu note downloads when the user pastes a note URL that already includes a valid `xsec_token`, and simplify pasted-video URL handling so downloader engines own redirects and extractor-specific URL interpretation.

## Requirements

- Preserve Xiaohongshu note URLs that already include a valid `xsec_token` when choosing the `yt-dlp` source URL.
- Keep the existing Xiaohongshu routing rule: video notes use `yt-dlp`, not direct `xhscdn` candidates.
- Do not regress the existing preference for tokenized Xiaohongshu detail URLs when they are available.
- Keep pasted-download behavior working whether the browser extension is connected or not.
- Keep app-side URL handling focused on safety validation, provider detection, and downloader routing.
- Remove Electron runtime short-link expansion before provider resolution; short links should be passed to the selected downloader or generic `yt-dlp` route.
- Remove X/Twitter `/status/<id>/photo/<n>` overlay canonicalization from pasted/page URL normalization.

## Acceptance Criteria

- [ ] Pasting `https://www.xiaohongshu.com/explore/<noteId>?xsec_token=...` queues a Xiaohongshu `yt-dlp` download that preserves the tokenized note URL instead of stripping it to `/explore/<noteId>`.
- [ ] The Xiaohongshu provider still prefers a tokenized `discovery/item/<noteId>?xsec_token=...` URL when one is available.
- [ ] Automated tests cover the tokenized `/explore/<noteId>?xsec_token=...` case and the existing canonical-routing expectations remain valid.
- [ ] Root cause is documented in the session response: the current failure is caused by Ameow normalizing away `xsec_token`, not by the extension-disconnected warning itself.
- [ ] Runtime queue execution no longer performs HEAD/GET/hidden-window short-link expansion before provider resolution.
- [ ] `normalizeVideoPageUrl(...)` preserves valid X/Twitter `/photo/<n>` URLs instead of converting them to status permalinks.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
