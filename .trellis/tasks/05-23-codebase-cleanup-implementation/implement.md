# Execution Plan

1. [x] Complete Phase 1 low-risk cleanup.
2. [x] Run focused validation for Phase 1.
3. [ ] Commit Phase 1.
4. Complete Phase 2 spec/doc alignment.
5. Run focused validation for Phase 2.
6. Commit Phase 2.
7. Complete Phase 3 extension legacy cleanup.
8. Run focused validation for Phase 3.
9. Commit Phase 3.
10. Complete Phase 4 packaging/release cleanup.
11. Run focused validation for Phase 4.
12. Commit Phase 4.
13. Run cross-phase validation and summarize remaining risks.

## Progress Notes

### Phase 1

- Removed confirmed unused files:
  - `src/engines/base-engine.ts`
  - `src/components/MaterialGrid.tsx`
  - `src/sites/template.ts`
  - `src/App.css`
  - `src/assets/react.svg`
- Removed obvious unused public asset:
  - `public/tauri.svg`
- Removed redundant/no-op package scripts:
  - `preelectron:build`
  - `typecheck`
- Validation completed:
  - `npm run type-check`
  - `npm run lint`
- `vite.config.ts` `TAURI_DEV_HOST` was intentionally left for a later phase because it still affects current dev-server host/HMR behavior and is not zero-risk.
