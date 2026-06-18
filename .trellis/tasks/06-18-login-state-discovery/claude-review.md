# Claude Review

Claude reviewed the planning artifacts for login-state discovery and download-time site-scoped cookie sync.

## Adopted Must-Fix Feedback

- Seeded site-session entries also start as `hidden_catalog`, not only gallery-dl catalog entries. Settings may initially show only the auto-sync toggle and no badges, so the plan now requires a compact empty hint.
- Instagram exists in both seeded configs and the gallery-dl catalog. Catalog-specific tests should use catalog-only entries such as Patreon or Boosty.
- Download-start sync needs a dedicated short timeout constant, recommended in the 5-8 second range, rather than relying on the scheduler default timeout.
- Runtime hook placement must ensure one sync per queued download, not one sync per engine candidate.
- Catalog entries often have empty required/login cookie keys, so `availability === "ready"` can be too permissive. The plan now requires freshness-aware refresh behavior for catalog entries.
- `ensureRefreshed(...)` can return `null` for non-fatal skips such as extension disconnected; download-start sync should treat that as continue-download behavior.

## Test Additions

- Extension disconnected/null refresh result continues download.
- Simultaneous downloads for the same site deduplicate or join in-flight refresh.
- Catalog URL/domain matching test uses a catalog-only site.
- Hook fires once per download.
- Partial sync snapshots still allow cookie injection when cookies were saved.

## Outcome

No broad redesign was needed. The main plan remains: blue discovery point enables download-time, site-scoped sync; no bulk sync at opt-in; existing refresh and auth recovery stay intact.
