# Context-aware toolbar popup with auto media scan

## Goal

Redesign the browser extension toolbar popup around a context-aware hub, automatic current-page media scanning, and video/audio/image media browsing.

This task revises the previously implemented/planned popup console direction in `05-24-extension-popup-console-media-browser`. The old model used top-level `Browse / Controls / Sites` tabs, manual scanning, and only `Video / Image` media filters. The new product direction is:

- use the context-aware hub concept from Scheme 3;
- scan the active page automatically when the toolbar popup opens;
- show media resources immediately when possible;
- add `Audio` as a first-class media type alongside `Video` and `Image`.

## Requirements

- The popup should behave as a compact context-aware command surface, not a static three-tab settings console.
- The top of the popup must answer the user's immediate page context:
  - desktop connection state;
  - current hostname/page identity when available;
  - launcher availability for the active page;
  - auto-scan status and resource counts.
- The popup should automatically scan the current active tab after opening when the page is scannable.
- If a same-URL cache exists, the popup may render it immediately, then refresh in the background and replace it with fresh results.
- Auto-scan must be bounded so opening the popup does not feel sluggish or noisy.
- Auto-scan must not fire for restricted browser pages such as `chrome://`, `chrome-extension://`, `edge://`, `about:`, or other pages where content scripts cannot run.
- Auto-scan should fire at most once per popup-open session for the same active tab URL, and rapid popup close/reopen should not start duplicate concurrent scans for the same tab URL.
- Cold first-open with no cache must render the popup shell and compact scanning state quickly instead of waiting for scan completion.
- Scan cache must be scoped by active tab id plus URL hash, and cache reads must verify the cached `pageUrl` still matches the active tab URL. This avoids both same-tab stale results after navigation and cross-tab pollution for the same URL.
- The media browser must support three filters:
  - `Video`;
  - `Audio`;
  - `Image`.
- The resource list should remain an advanced/manual-selection surface. The in-page launcher remains the ordinary current-page action surface for current-content download and element picking.
- Candidate rows should remain compact:
  - media badge or thumbnail/preview when cheap;
  - short title or filename;
  - concise host/source/format metadata;
  - one row menu for secondary actions.
- Row menu actions should include:
  - download;
  - copy link;
  - view source/details.
- `Download this page` remains a conditional fallback only when the in-page launcher is unavailable, hidden, or the page cannot host injected UI.
- In the context-aware layout, conditional `Download this page` belongs in the primary context card as a muted secondary action. If the launcher is hidden on the current site, `Restore launcher` is the primary action and `Download this page` remains secondary. Restricted browser pages should not show a misleading download fallback when the URL itself is not a meaningful downloadable page.
- Audio detection should filter obvious noise:
  - include audio elements, audio source elements, and direct audio resources with stable audio extensions or MIME types;
  - prefer `mp3`, `m4a`, `aac`, `wav`, `ogg`, `oga`, `flac`, and `opus`;
  - exclude known streaming fragment/playlist shapes such as `m3u8`, `mpd`, `m4s`, `ts`, and tiny segment-like URLs unless a later provider-specific path explicitly needs them;
  - exclude candidates with known duration below 5 seconds;
  - dedupe audio by normalized URL and media type.
- Global settings should be collapsed below the contextual hub:
  - quality preference;
  - launcher position/state;
  - hidden-site management.
- Hidden-site management should not occupy a dedicated top-level tab in the new default surface. It should be reachable as a collapsed section or secondary management view.
- Restricted pages, injection failures, scan timeouts, and empty results should show compact page-specific states instead of silent failure.
- Existing injected site buttons and existing context-menu/right-click code are not removed by this task.
- The implementation must respect Chrome extension popup lifetime constraints: scan state must be recoverable or cached across close/reopen.
- The design must preserve Ameow's compact product visual language: restrained surface stack, soft blue for active/focus/progress, minimal chrome, no marketing-style panels.

## Acceptance Criteria

- [ ] The planning artifacts explicitly supersede the older manual-scan `Video / Image` popup model for this new task.
- [ ] The popup uses a context-aware hub layout rather than a fixed `Browse / Controls / Sites` top-level tab layout.
- [ ] Opening the popup starts a bounded auto-scan for the active scannable page.
- [ ] Auto-scan is skipped for restricted pages before waiting on content-script timeout.
- [ ] Auto-scan fires at most once per popup-open session for the same active tab URL.
- [ ] Rapid popup close/reopen does not launch duplicate concurrent scans for the same active tab URL.
- [ ] Existing fresh same-URL scan results can appear immediately while a refresh scan runs.
- [ ] Cold first-open with no cache shows the header, context card, and compact scanning state without a blank waiting period.
- [ ] The media browser includes `Video`, `Audio`, and `Image` filters.
- [ ] Audio candidates are detected, deduplicated, displayed, and actionable like video/image candidates.
- [ ] Audio candidates exclude obvious short UI sounds and streaming fragments according to the task's audio filtering rules.
- [ ] Auto-scan does not block fast first render of the popup shell and context state.
- [ ] Scan results are bounded, deduplicated, and scoped to active tab id plus active tab URL to avoid cross-page and cross-tab cache pollution.
- [ ] Scan cache entries are not returned when their stored `pageUrl` no longer matches the active tab URL.
- [ ] Restricted pages and scan failures show compact unavailable/failure states.
- [ ] `Download this page` is visible only as a conditional fallback.
- [ ] Quality, launcher position/state, and hidden-site management are reachable without competing with the primary context card.
- [ ] Existing launcher quick actions continue to be treated as the normal page-level download path.
- [ ] Existing injected buttons and context-menu/right-click paths remain unchanged by this task.
- [ ] Claude review is captured in this task before implementation starts.

## Claude Review Notes

Claude reviewed the initial planning artifacts for this task and found the direction coherent, but identified specification gaps to close before implementation:

- clarify scan cache scoping so it is not URL-only and does not show stale results after navigation;
- define concrete audio noise filters before implementing audio detection;
- place conditional `Download this page` in the new context card, visually secondary to restore/recovery actions;
- add auto-scan guardrail acceptance criteria for restricted pages, duplicate scans, navigation invalidation, and cold first render;
- explicitly update background response normalization and tests for the new `audios` collection.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- This is a complex task. Add `design.md` and `implement.md` before `task.py start`.
