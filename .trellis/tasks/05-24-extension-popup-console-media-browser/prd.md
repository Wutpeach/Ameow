# Implement extension popup console and media browser

## Goal

Implement the next post-MVP browser-extension UI increment: a restrained toolbar popup console that manages launcher recovery/settings and hosts a popup-local advanced media browser for the current page.

## Requirements

- This task implements the approved Phase 3/4 direction from the parent browser-extension redesign task.
- The browser toolbar popup becomes a compact three-tab console:
  - `Browse`
  - `Controls`
  - `Sites`
- The popup should be wider than the current 236px surface, targeting roughly 320-340px, while staying refined and scannable.
- The popup should always open to `Browse`. It should not remember the previously selected top-level tab.
- `Browse` is the primary surface for the advanced media browser.
- The advanced media browser scans the active page only after explicit user action. It must not auto-scan on popup open.
- Browse sub-tabs are limited to:
  - `Video`
  - `Image`
- There is no `All` sub-tab and no `Link` sub-tab.
- Links are source metadata for video/image candidates, not a user-facing media category.
- Candidate rows should expose only core information in the visible row:
  - media type/status symbol;
  - short title or filename;
  - concise source/host/format metadata;
  - compact state when needed.
- Per-row actions should be hidden behind an icon/menu entry such as `...`, not repeated as text buttons across every row.
- The candidate row menu should include:
  - download;
  - copy link;
  - view source/details.
- `Controls` owns launcher and preference controls:
  - desktop connection state;
  - quality preference;
  - global launcher enabled state;
  - current-site launcher restore when hidden;
  - side/edge selection;
  - reset launcher position.
- `Sites` owns hidden-site management:
  - hidden site list;
  - restore individual site;
  - restore all hidden sites.
- The in-page launcher remains a quick current-page entry, not a full management center.
- The launcher may keep immediate page actions such as pick download, current-content download, compact feedback, drag/lock, hide on this site, and side switching.
- Old injected site buttons and existing context-menu/right-click code remain under observation and are not removed in this task.
- The UI must stay compact, calm, and status-driven. Avoid filling visible areas with every possible control.
- The implementation must respect Chrome extension popup lifetime constraints: the popup may close on blur, so scan results and transient state needed across popup reopen should be cached or recoverable.

## Acceptance Criteria

- [ ] The popup has a three-tab structure: `Browse`, `Controls`, and `Sites`.
- [ ] The popup always opens to `Browse`.
- [ ] `Browse` shows only `Video` and `Image` sub-tabs.
- [ ] `Browse` does not scan automatically when the popup opens.
- [ ] Manual scan retrieves active-page video/image candidates and renders them in the selected sub-tab.
- [ ] Candidate rows use compact visible metadata and place download/copy/source actions behind a row menu.
- [ ] `Controls` includes launcher global state, quality preference, current-site restore, edge side selection, and reset position.
- [ ] `Sites` lists hidden sites and supports single-site restore plus restore-all.
- [ ] Hidden-site and launcher-position changes propagate to the active tab launcher without requiring browser restart.
- [ ] Scan results are bounded, deduplicated, and do not make the popup sluggish on media-heavy pages.
- [ ] Restricted or unscannable pages show a clear compact state instead of failing silently.
- [ ] Existing injected buttons and context-menu/right-click paths are not removed by this task.
- [ ] Focused validation covers Phase 3 launcher/site management and Phase 4 media scanning/filtering/actions.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
