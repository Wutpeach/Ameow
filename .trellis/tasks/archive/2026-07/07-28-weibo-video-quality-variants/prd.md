# Fix Weibo video quality and gallery-dl handling

## Goal

Fix Weibo video downloads so Ameow does not silently lose quality, and update the managed gallery-dl runtime so Weibo extraction is tested against a current upstream version.

User-facing value:

- Weibo video downloads should prefer the best available quality when the user asks for best quality.
- If gallery-dl can reliably choose the highest Weibo quality, Ameow should accept that behavior instead of adding redundant custom routing.
- Users should not be forced into the currently playing rendition when the maintained Weibo extractor can resolve a better source from the page URL.
- Existing fallback behavior should remain reliable when Weibo extraction or auth state changes.
- The packaged/managed gallery-dl version should be brought current through the repository's existing managed Python package mechanism.

## Confirmed Facts

- `src/sites/weibo.ts` routes normal Weibo detail/status downloads to `gallery-dl` first, then falls back to `yt-dlp`.
- `src/sites/weibo.ts` routes Weibo `tv/show` pages to `yt-dlp` only, because the current provider states these pages are supported by `yt-dlp` but not by `gallery-dl`.
- `src/sites/gallery-dl-support.ts` normalizes many Weibo URLs to `https://weibo.com/detail/<statusId>` before `gallery-dl` extraction.
- `src/electron-runtime/galleryDlCommandPlan.ts` does not consume Ameow's `videoQuality` preference; it delegates resource choice to `gallery-dl`.
- `src/electron-runtime/ytDlpCommandPlan.ts` applies `videoQuality` through `resolveYtdlpFormatProfile`.
- `src/electron-runtime/engineManifest.ts` maps `best` to `bestvideo+bestaudio/best`, while `balanced` and `data_saver` intentionally constrain format choice for compatibility or lower data use.
- `browser-extension/background.js` forwards extension video selections to the desktop app as `video_selected_v2` payloads with `url`, `pageUrl`, `videoUrl`, `videoCandidates`, `siteHint`, and `videoQuality`.
- `browser-extension/generic-video-detector.js` discovers video candidates from visible video elements, `currentSrc`/`src`, nested `<source>` elements, recent performance resource URLs, and direct page links.
- `browser-extension/generic-video-selection-utils.js` prefers direct CDN/direct MP4 candidates over indirect media and manifest candidates.
- The current extension detector does not parse a Weibo-specific video variant source and does not group multiple qualities under one logical Weibo video entry.
- `electron/managedPythonPackageManifest.mts` currently pins gallery-dl as `gallery-dl==1.32.1`.
- `electron/managedRuntimeBootstrap.mts` installs managed Python tools with `python -m pip install --upgrade --disable-pip-version-check --no-cache-dir <installSource>`, so gallery-dl is currently obtained from PyPI through pip, not from a bundled GitHub/Codeberg standalone executable.
- Official upstream docs say stable gallery-dl releases are distributed on PyPI and can be installed/upgraded with `python -m pip install -U gallery-dl`.
- The current upstream release page shows `v1.32.8` as latest, and release entries state that active development has moved to Codeberg with Codeberg release-tag links.
- The `v1.32.8` release notes include a Weibo fix: "fix video format selection", which is directly relevant to this task.
- In gallery-dl `v1.32.8`, the Weibo extractor chooses the highest `quality_index` from `playback_list` when that list exists. This suggests gallery-dl currently chooses the highest reported Weibo quality internally, but does not expose all Weibo variants to Ameow for user selection.
- gallery-dl docs provide general `-o/--option`, file filtering, and `downloader.ytdl.format` controls. No Weibo-specific quality selection option has been confirmed yet.
- Product decision: if gallery-dl reliably selects highest Weibo quality but cannot express `balanced` or `data_saver`, do not add a forced fallback route just to make gallery-dl obey those preferences. Keep the implementation lean and avoid redundant downloader routing.

## Upstream Sources Checked

- PyPI gallery-dl project page: https://pypi.org/project/gallery-dl/
- GitHub releases mirror: https://github.com/mikf/gallery-dl/releases
- Codeberg release linked from GitHub `v1.32.8`: https://codeberg.org/mikf/gallery-dl/releases/tag/v1.32.8
- gallery-dl `v1.32.8` Weibo extractor source: https://raw.githubusercontent.com/mikf/gallery-dl/v1.32.8/gallery_dl/extractor/weibo.py

## Requirements

- Preserve the current reliable Weibo fallback chain unless implementation evidence shows a better order for specific URL classes.
- Update the managed gallery-dl pin and verify the updated runtime is installed through the existing managed Python package flow.
- Determine whether gallery-dl can support application-controlled Weibo quality selection through existing CLI/config options, but do not create a custom fallback route solely to force non-best quality selection.
- Prefer using gallery-dl's own Weibo extractor when it can reliably select the requested quality.
- Add or design a Weibo-specific variant resolver only if updated gallery-dl still fails to obtain highest quality for Weibo.
- Treat browser-observed direct media URLs as evidence for the current rendition, not as proof that no higher quality exists.
- Make sure the Weibo provider/page extraction path is not displaced by lower-quality direct playback URLs.
- Keep existing direct-download fallback behavior for cases where only one direct media URL is available.
- Keep auth/session behavior compatible with current extension cookie/site-session forwarding.
- Add focused tests for Weibo URL normalization, gallery-dl version pinning, command planning, and fallback behavior.

## Acceptance Criteria

- [x] Normal Weibo detail/status URLs still resolve through the Weibo provider and retain a fallback path.
- [x] Weibo `tv/show` URLs continue to use a supported engine path.
- [x] Managed gallery-dl updates from `1.32.1` to the selected current stable upstream version.
- [x] gallery-dl-backed Weibo downloads are verified to use gallery-dl's highest-quality Weibo behavior where available.
- [x] Weibo page/provider extraction is not overwritten by `video.currentSrc` from the currently playing lower quality.
- [x] If variant enumeration fails, the previous single-candidate download path still works.
- [x] Tests cover at least one currently-playing-720-with-higher-variant-available scenario.
- [x] Tests or documented manual verification cover the updated gallery-dl version and Weibo extraction behavior.
- [x] Public docs or troubleshooting notes are updated if user-facing behavior changes.

## Out Of Scope

- Browser-to-desktop app launch or native messaging work.
- Adding a new browser feature to wake or launch the desktop app.
- Replacing the whole download orchestration architecture.
- Removing `gallery-dl` support for Weibo without evidence from implementation testing.
- Adding a forced fallback route just to make gallery-dl obey `balanced` or `data_saver` when gallery-dl only exposes highest-quality Weibo selection.
- Adding unrelated quality picker support for non-Weibo sites.

## Product Decision

gallery-dl does not need to be forced under the browser extension quality selector if that would require redundant custom routing. If updated gallery-dl reliably selects the highest Weibo quality, accept that for gallery-dl-backed Weibo downloads.

## Notes

- This is a separate task from `06-20-extension-desktop-launch-bridge-evaluation`.
