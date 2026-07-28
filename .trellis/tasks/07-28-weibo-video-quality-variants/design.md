# Design: Weibo video quality and gallery-dl handling

## Architecture

The fix should first make the existing gallery-dl-backed Weibo path current and verify that gallery-dl reliably chooses the highest Weibo quality. A Weibo-specific variant resolver should be added only if updated gallery-dl still fails to obtain highest quality.

Current generic browser detection is useful for "what is playing now", but it is not authoritative for all qualities. The Weibo path should prefer site extraction over blindly trusting `video.currentSrc`.

## Proposed Boundaries

- Browser extension:
  - Detect that the active page or selected media belongs to Weibo.
  - Continue forwarding page URL and generic media evidence through the current connected download flow.
  - Preserve generic candidates as fallback evidence, not as authoritative variant lists.
- Desktop runtime:
  - Continue using the Weibo provider for Weibo URLs.
  - Update the managed gallery-dl pin through `electron/managedPythonPackageManifest.mts`.
  - Let updated gallery-dl select highest Weibo quality if that behavior is verified.
  - Avoid replacing Weibo page extraction with the currently playing `video.currentSrc` when the page URL is available.
- Shared contract:
  - Keep `videoQuality` as the primary cross-engine quality preference for engines that can honor it.
  - Do not add selected-variant fields solely to force gallery-dl non-best quality selection.

## Data Flow

1. User invokes download from the extension on a Weibo video.
2. Extension forwards the Weibo page URL, generic media evidence, and `videoQuality` through the current request path.
3. Desktop runtime resolves the request with the Weibo provider.
4. Weibo provider selects the engine chain:
   - normal detail/status pages: gallery-dl first, yt-dlp fallback;
   - `tv/show` pages: yt-dlp path.
5. gallery-dl command planning remains lean unless a supported upstream option is found.
6. If gallery-dl reliably selects highest Weibo quality, accept that behavior and document that gallery-dl-backed Weibo ignores non-best quality preferences.
7. If gallery-dl cannot reliably produce highest quality for Weibo after update, add a Weibo-specific resolver path using page/player evidence.

## Compatibility Notes

- Existing `videoCandidates` payloads should remain accepted for older extension behavior and fallback paths.
- Current Weibo `gallery-dl` first behavior should not be removed until implementation testing proves it causes lower quality than `yt-dlp` for the relevant URL class.
- `gallery-dl` does not currently consume Ameow's `videoQuality`; this is acceptable if updated gallery-dl reliably selects highest Weibo quality.
- gallery-dl is managed as a Python package installed by pip, not as a downloaded GitHub/Codeberg binary. Updating the bundled/managed version means updating the pinned package spec and rebuilding/reinstalling the managed runtime.
- Site session and cookies remain important because Weibo quality APIs or media URLs may require logged-in context.

## Trade-Offs

- Using gallery-dl's maintained extractor keeps Ameow aligned with upstream Weibo changes and keeps code simple, but may limit user-selectable non-best quality controls.
- Implementing Ameow's own Weibo variant resolver gives stronger UI control, but is not justified if updated gallery-dl already resolves highest quality.
- Routing explicit non-best quality selections to yt-dlp would add complexity and is intentionally out of scope for this task.

## Rollback

- Keep generic `videoCandidates` and direct URL download paths intact.
- Gate any Weibo-specific quality integration behind evidence that updated gallery-dl still fails highest-quality extraction.
- If Weibo variant resolution fails, fall back to the current single-resource download behavior.
