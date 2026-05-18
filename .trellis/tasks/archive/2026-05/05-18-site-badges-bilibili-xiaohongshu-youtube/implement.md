# Implementation Plan

1. Update the Settings page badge model to support the three site entries.
2. Reduce badge copy to the minimal state label plus state dot.
3. Map site session data into the three-state model:
   - ready -> `已登录`
   - invalid/incomplete -> `失效`
   - missing -> `未登录`
4. Wire badge clicks to the existing Playwright capture entry point for supported sites.
5. Keep Douyin behavior intact while reusing the same badge rendering pattern.
6. Update localized strings for the three-state labels and action hints.
7. Verify the Settings layout still fits the compact panel without overflow.
8. Run lint and typecheck.

## Validation

- `npm run lint`
- `npm run type-check`

## Notes

- If a site is not yet backed by a session capture flow, keep the badge informational rather than pretending it can refresh silently.
- Do not add extra status dimensions unless they are required by the existing backend state model.
