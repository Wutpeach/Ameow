# Design

## Problem

Windows bootstart can surface `GitHub pinned lookup failed: 403` during managed runtime bootstrap even when a global desktop proxy is configured. The startup proxy application path appears correct, so the failure is more likely tied to the unauthenticated GitHub release metadata request or to a proxy that rejects/blocks that metadata request.

## Proposed Approach

1. Remove the GitHub release metadata lookup entirely for pinned yt-dlp and gallery-dl bootstrap.
2. Resolve the final download URLs directly from the pinned version and the known platform-specific asset names.
3. Keep the large binary download path on the existing Electron session fetch so the app still honors the configured desktop proxy for the actual asset transfer.

## Boundaries

- Scope includes `electron/managedRuntimeBootstrap.mts` and the tests around pinned release resolution.
- Scope does not change Windows autostart login-item behavior.
- Scope does not change proxy configuration storage or validation unless diagnostics prove that path is wrong.

## Tradeoffs

- Direct URLs remove the startup dependency on GitHub API availability and rate limits.
- The tradeoff is that the fixed tag and asset names must stay in sync with the packaged version metadata.

## Verification Strategy

- Unit tests for the metadata lookup helper covering:
  - success path
  - 403 with a usable fallback fetch
  - 403 with no usable fallback, preserving the error
  - diagnostic payload/logging shape if implemented
- Targeted startup/runtime tests to confirm the managed bootstrap still uses the session fetch for real downloads.
