import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const settingsPageSource = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

describe("settings site-session sync feedback", () => {
  it("keeps action outcomes out of the loader's error map", () => {
    // `loadSiteSessionPanelState` rewrites `siteSessionErrors` wholesale on every
    // refresh. An action error written into that map was therefore erased before
    // the user could ever see it, which is why a failed sync looked like a no-op.
    expect(settingsPageSource).toContain("siteSessionActionErrors");
    expect(settingsPageSource).toContain("setSiteSessionActionError(");
    // The renamed setter has no remaining callers under the old name.
    expect(settingsPageSource).not.toContain("setSiteSessionError(");
  });

  it("reports the three sync phases on the row itself", () => {
    expect(settingsPageSource).toContain("siteSessions.syncingButton");
    expect(settingsPageSource).toContain("siteSessions.syncedButton");
    expect(settingsPageSource).toContain("siteSessions.syncedDetail");
    expect(settingsPageSource).toContain("siteSessions.age.justNow");
    expect(settingsPageSource).toContain("formatSiteSessionAge");
  });

  it("renders a per-row error instead of only the page-level summary", () => {
    expect(settingsPageSource).toContain("site.inlineError");
  });

  it("keeps the page-level line actionable instead of repeating the row error", () => {
    expect(settingsPageSource).toContain("siteSessions.syncRecoveryHint");
    // The summary must not render the raw error again; the row already carries it.
    expect(settingsPageSource).not.toContain("{siteSessionError}\n");
  });
});
