# Implementation Plan

1. Inspect the pinned release lookup helper and add response diagnostics that can distinguish GitHub rate limiting, proxy rejection, and generic non-OK failures.
2. Replace the metadata fetch with direct release download URL construction from the pinned version and platform-specific asset name.
3. Preserve the existing session-backed path for actual runtime asset downloads.
4. Extend or add tests in `electron/managedRuntimeBootstrap.test.mts` to cover the new direct-URL behavior and remove the old metadata-fetch expectation.
5. Run the relevant test subset, then project lint/type-check before asking for planning approval to start implementation.

## Validation

- `npm test -- electron/managedRuntimeBootstrap.test.mts`
- `npm run lint`
- `npm run type-check`

## Rollback Points

- If the direct URL path breaks asset name/version alignment, revert to the prior lookup logic only as a temporary debug aid.
- If the helper becomes too coupled to fetch behavior, keep the fix limited to direct URL construction and test coverage.
