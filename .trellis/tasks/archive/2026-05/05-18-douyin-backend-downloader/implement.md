# Implement

## Plan

1. Add the new managed runtime component and status plumbing.
2. Extend managed runtime bootstrap with Douyin Python install logic.
3. Add the new engine id and manifest.
4. Route Douyin to the new engine first and validate CLI execution.
5. Add app-owned Douyin session storage plus a main-process command to launch upstream Playwright cookie capture.
6. Add settings-page UI for Douyin session status and login/refresh/clear actions.
7. Make Douyin downloads use the app-owned session cookies.
8. Update specs/tests to reflect the new runtime, route, and session behavior.
9. Run verification and fix any contract drift.

## Validation

- `npm run type-check`
- `npm run lint`
- `npm test`

## Rollback Points

- New runtime component plumbing
- New engine manifest
- Douyin route order change
- Douyin session capture / settings UI path

## Notes

- Keep the change scoped to single-item Douyin downloads.
- Do not change non-Douyin site strategies unless required by shared engine typing.
- Browser extension capabilities remain; only Douyin cookie sourcing is being moved out of the extension path.
