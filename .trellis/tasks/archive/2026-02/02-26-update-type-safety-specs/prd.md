# Update frontend and backend type safety specs

## Goal
Align frontend and backend type-safety documentation with real executable contracts in the codebase, and fill the missing backend type-safety spec.

## Requirements
- Add `.trellis/spec/backend/type-safety.md` with executable contract sections.
- Update `.trellis/spec/backend/index.md` to include backend type-safety guide.
- Upgrade `.trellis/spec/frontend/type-safety.md` to include concrete Tauri command/event type contracts and validation rules.
- Keep all spec content in English and consistent with existing spec style.

## Acceptance Criteria
- [x] Backend type-safety spec file exists and includes signatures, contracts, validation/error matrix, Good/Base/Bad cases, tests, and Wrong vs Correct.
- [x] Backend index links to the new type-safety spec.
- [x] Frontend type-safety spec includes concrete command/event typing contracts and anti-pattern guidance.
- [x] Specs are based on existing code in `src-tauri/src/lib.rs`, `src/App.tsx`, and `src/contexts/ThemeContext.tsx`.

## Technical Notes
- Backend contract source of truth: `src-tauri/src/lib.rs` command signatures and serde structs.
- Frontend contract source of truth: typed `invoke<T>()` and `listen<T>()` usage in React code.
