# Fix site login proxy and user agent

## Goal

Improve the reliability of Settings-owned site login capture windows, especially YouTube, by making the app-owned site-session Chromium profiles use the same configured desktop proxy behavior as the rest of Electron networking and by tightening browser-like user-agent / language handling.

This is an incremental fix. It should reduce avoidable "site is not secure", network, proxy, and browser-fingerprint failures, but it must not claim to bypass Google/YouTube embedded-browser login policy.

## Confirmed Facts

- Site login capture is owned by Settings and Electron main, not by the browser extension.
- Capture windows use stable app-owned partitions named `persist:ameow-site-session-<siteId>`.
- `applyConfiguredDesktopProxy(...)` currently applies the configured proxy only to `session.defaultSession`.
- Site login capture windows use `session.fromPartition(partition)`, so they may not inherit the configured fixed-server proxy.
- Capture hardening currently strips `Electron/` and `Ameow/` from the user agent and sets accept-language on the capture session.
- YouTube login opens `https://www.youtube.com/` and may redirect into Google account login.
- Browser extension cookie capture and manual cookie import are out of scope for this first attempt.

## Requirements

- Apply the validated global proxy configuration to site-session capture partitions used by Settings login windows.
- Keep disabled proxy behavior equivalent to current desktop networking: use system proxy mode.
- Keep configured proxy validation centralized through the existing global proxy validator.
- Preserve stable site-session partitions and existing cookie snapshot behavior.
- Keep capture-session setup idempotent; repeated login windows for the same site must not stack duplicate listeners.
- Re-apply proxy settings to capture partitions whenever a capture window starts, including after app restart, because Electron proxy configuration is not part of persisted cookie/storage state.
- Do not let listener deduplication skip proxy re-application for an already configured partition.
- When proxy config is saved at runtime, apply the new proxy state to known site-session capture partitions or ensure the next capture start applies the latest config before first navigation.
- Improve or verify browser-like UA / accept-language handling for site-session capture windows without adding brittle site-specific spoofing.
- Do not add browser-extension cookie synchronization in this task.
- Do not add or expose manual cookies import in this task.
- Do not weaken security by ignoring certificate errors or accepting unsafe navigation schemes.
- Do not promise YouTube login success when Google blocks embedded/app-controlled browsers.

## Acceptance Criteria

- [ ] With custom proxy enabled, Settings site login capture sessions apply the same normalized proxy URL as Electron desktop networking.
- [ ] With custom proxy disabled, Settings site login capture sessions use system proxy behavior.
- [ ] Saving proxy settings updates future site login capture sessions without requiring manual config edits.
- [ ] Reopening a login capture window for the same site applies the current proxy before the first navigation, even when webRequest listeners were already registered.
- [ ] Site login capture still uses stable per-site partitions and can still save a Netscape cookie snapshot after user confirmation.
- [ ] UA / accept-language behavior is covered by tests or a focused review showing Electron/Ameow tokens are stripped and fallback behavior is browser-like.
- [ ] Tests cover proxy application for non-default capture sessions, including enabled and disabled proxy states.
- [ ] `npm run type-check` passes.
- [ ] No browser-extension cookie sync, manual cookies import UI, or certificate-error bypass is introduced.

## Out Of Scope

- Browser extension based YouTube cookie synchronization.
- Manual `cookies.txt` import UI or user-facing advanced cookie management.
- Reusing the user's Chrome/Edge browser profile directly.
- Attempting to bypass Google embedded-browser login enforcement.
- Changing downloader cookie file internals beyond what is required to preserve existing site-session behavior.

## Open Questions

- None blocking planning. The selected first attempt is proxy consistency plus UA/language tightening only.
