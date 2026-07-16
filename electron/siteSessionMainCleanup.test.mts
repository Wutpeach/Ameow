import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(path.resolve("electron/main.mts"), "utf8");

describe("site-session main cleanup", () => {
  it("does not expose obsolete pending indicators, direct cookie push, or global auto-sync gating", () => {
    expect(mainSource).not.toContain("get_site_session_pending_actions");
    expect(mainSource).not.toContain("site-session-pending-actions-changed");
    expect(mainSource).not.toContain("site_session_cookie_sync_direct");
    expect(mainSource).not.toContain("resolveSiteSessionAutoSyncEnabled");
    expect(mainSource).toContain("site_session_sync_request");
  });
});
