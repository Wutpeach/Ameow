# Implementation Plan

1. Inspect the current cookie injection branch in Electron main and identify the site-id decision point.
2. Replace the Douyin-only path with a site-aware resolver that can look up cookies by site.
3. Preserve the existing Douyin session manager behavior and cookie file format.
4. Keep the downloader-side interface unchanged where possible; only expand the source of cookies.
5. Verify the existing Douyin download path still receives cookies.
6. Validate the new site-aware path with the badge-supported sites.
7. Run lint and typecheck.

## Validation

- `npm run lint`
- `npm run type-check`
