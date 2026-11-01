# Resolve Default Branch Dependency Security Alerts

## Goal
Clear the current open npm dependency security alerts on the default branch without widening the scope beyond dependency metadata updates.

## Requirements
- Remediate the currently open Dependabot/npm audit findings affecting the root dependency graph.
- Prefer lockfile-only updates when existing semver ranges already allow patched versions.
- Keep runtime behavior unchanged unless a dependency update requires a compatible patch-level adjustment.
- Verify the updated dependency graph with audit, type-check, and lint.

## Acceptance Criteria
- [ ] Open npm dependency alerts on the default branch are resolved by the updated dependency graph.
- [ ] `npm audit` reports zero known vulnerabilities for the root project.
- [ ] `npm run type-check` passes.
- [ ] `npm run lint` passes.

## Technical Notes
- Scope is limited to the root npm workspace in this repository.
- Prior investigation shows direct fixes are available within the existing version ranges for `vite` and `electron`.
- Transitive vulnerable packages can be refreshed through a lockfile update without changing declared dependency ranges.
