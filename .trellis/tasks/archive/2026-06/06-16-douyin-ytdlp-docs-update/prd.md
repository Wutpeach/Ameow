# Update docs for Douyin yt-dlp and compatible format behavior

## Goal

Update the public documentation site and any directly related user-facing wording so recent Douyin download and format-handling behavior is accurately described.

Users should understand:

- Douyin video downloads now use the shared `yt-dlp` path.
- Common Douyin video links, including short links and `jingxuan?modal_id=...`, are valid download inputs.
- Douyin note/gallery downloads are not a current support target.
- Login state is still relevant when a site requires it, but Douyin video downloads no longer require a separate Douyin-specific downloader runtime.
- Compatible outputs are preserved when possible instead of being transcoded unnecessarily.

## Requirements

- Update Chinese and English docs-site pages where the current text is incomplete or could mislead users after the Douyin `yt-dlp` takeover.
- Cover Douyin video input shapes:
  - `https://v.douyin.com/...` short links;
  - `https://www.douyin.com/video/{id}`;
  - `https://www.iesdouyin.com/share/video/{id}/`;
  - `https://www.douyin.com/jingxuan?modal_id={id}`.
- State that Douyin note/gallery downloads are out of scope for current public support.
- Clarify that Douyin videos use the general `yt-dlp` download capability, not a separate Douyin downloader runtime.
- Update format/compatibility docs to say compatible `MP4/MOV + H.264/H.265 + AAC` outputs are kept without extra transcoding when possible.
- Review user-facing locale strings for stale "Douyin Downloader runtime/session" wording and update them if they can appear in the product or extension UI.
- Keep all changes documentation/copy-only. Do not change download routing, transcode logic, runtime bootstrap, or provider behavior in this task.

## Acceptance Criteria

- [ ] Chinese docs mention current Douyin video support, accepted link shapes, and note/gallery limits.
- [ ] English docs contain the same product guidance.
- [ ] Docs explain that Douyin video downloads use `yt-dlp` and do not require a Douyin-specific runtime preparation step.
- [ ] Format docs explain when compatible downloaded files avoid transcoding.
- [ ] Stale user-visible "Douyin Downloader" wording is removed or replaced where applicable.
- [ ] `npm run docs:build` passes.
- [ ] `git diff --check` passes.

## Notes

- This is a lightweight documentation/copy task. `prd.md` is enough unless implementation uncovers wider user-facing behavior changes.
- Relevant likely files:
  - `site/src/content/docs/docs/extension/supported-sites.md`
  - `site/src/content/docs/en/docs/extension/supported-sites.md`
  - `site/src/content/docs/docs/extension/cookies-and-login.md`
  - `site/src/content/docs/en/docs/extension/cookies-and-login.md`
  - `site/src/content/docs/docs/advanced/download-dependencies.md`
  - `site/src/content/docs/en/docs/advanced/download-dependencies.md`
  - `site/src/content/docs/docs/advanced/ae-compatibility.md`
  - `site/src/content/docs/en/docs/advanced/ae-compatibility.md`
  - `site/src/content/docs/docs/advanced/quality-and-formats.md`
  - `site/src/content/docs/en/docs/advanced/quality-and-formats.md`
  - `locales/*/desktop.json`
  - `browser-extension/locales/*/desktop.json`
