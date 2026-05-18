# Design

## Scope

Generalize site cookie/session injection so captured cookies can flow from the site badge capture path into the correct downloader path for each supported site.

## Data Flow

- A badge click starts the site-specific Playwright capture flow.
- The capture flow writes cookies for that site.
- Download execution resolves cookies based on the current site id, not a single hardcoded Douyin branch.
- `yt-dlp` and `gallery-dl` continue to consume cookies through the existing cookies-file mechanism.

## Boundaries

- Preserve the existing Douyin behavior.
- Keep the cookie format compatible with the current downloader-side `--cookies` usage.
- Make the routing decision by site id, so adding a new site later does not require another one-off hardcoded branch.

## Risks

- If the routing is not generalized, new badge flows will look complete in UI but never reach the downloader.
- The site-aware cookie path must stay aligned with the capture backend; a badge with no real cookie destination should not be presented as fully supported.
