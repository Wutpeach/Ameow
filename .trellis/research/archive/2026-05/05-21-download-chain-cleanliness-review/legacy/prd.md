# download chain cleanliness review

## Goal

Make the download chain cleaner by removing stale YouTube mode logic, migrating the browser/download quality preference to a product-level concept, and consolidating repeated preference normalization into a shared helper layer.

## Requirements

- Treat download quality as a product-level preference with these semantics:
  - `balanced`: first try exact 1080p; if unavailable, choose the highest available `<=1080p`
  - `best`: choose the highest currently available quality
  - `data_saver`: choose the lowest currently available quality
- Remove stale YouTube mode logic and align the runtime with the quality contract instead of preserving patchy light-mode behavior.
- Migrate the browser-extension wire payload and internal naming away from `ytdlp*` where feasible while keeping compatibility for existing inputs during this change.
- Consolidate repeated quality-preference normalization into one shared helper used by Electron boundary code and runtime normalization.
- Preserve current payload compatibility for legacy inputs (`high`/`standard`, snake_case variants, optional fields) while the new wire shape is introduced.

## Acceptance Criteria

- [ ] Browser-extension payloads use the product-level quality field and the app accepts legacy aliases during migration.
- [ ] There is a single shared normalization source for the download quality preference.
- [ ] YouTube download selection matches the approved quality semantics.
- [ ] Existing tests for YouTube fallback, queue payload handling, and legacy preference parsing still pass.
- [ ] No behavior change for non-quality-aware download routes beyond carrying the normalized preference.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
