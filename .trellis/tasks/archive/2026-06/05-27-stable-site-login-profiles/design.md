# Stable Site Login Profiles Roadmap Design

## Architecture Direction

The site-login system should be structured around two durable concepts:

- Site browser profile: app-owned Chromium profile/partition used for user login continuity.
- Downloader credential snapshot: explicit saved cookie artifact used by download engines.

These concepts should remain separate even when the MVP updates both through the same user action. That separation keeps later phases possible without replacing the Phase 1 implementation.

## Extension Points To Preserve

- Partition resolution should be centralized so later profile versioning/migration does not require searching for string literals.
- Cookie snapshot extraction should remain callable independently from opening a new login window.
- Clear/reset behavior should flow through one explicit manager method.
- Auth-required download failures should remain classifiable and observable so Phase 3 can hook a one-time refresh/retry path.
- Site definitions should remain the source of truth for login URL, cookie domains, required keys, and login marker keys.

## Child Task Map

- Phase 1 MVP: `05-27-mvp-stable-site-login-profiles`
- Phase 2 credential refresh: future child task
- Phase 3 auth-failure assisted refresh: future child task
- Phase 4 site policy/profile diagnostics: future child task

## Non-Goals

The roadmap should not drift into a generalized anti-fingerprint browser. Browser-like UA and language hardening are acceptable; broad spoofing, proxy orchestration, or security bypass are not part of this product direction.
