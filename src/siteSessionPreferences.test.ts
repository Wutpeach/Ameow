import { describe, expect, it } from "vitest";

import {
  resolveSiteSessionAutoSyncEnabled,
  resolveSiteSessionAutoSyncEnabledFromConfigString,
  resolveSiteSessionDiscoveryDismissed,
  resolveSiteSessionDiscoveryDismissedFromConfigString,
  SITE_SESSION_AUTO_SYNC_CONFIG_KEY,
  SITE_SESSION_DISCOVERY_DISMISSED_CONFIG_KEY,
} from "./siteSessionPreferences";

describe("site session preferences", () => {
  it("enables auto sync only for a boolean true config value", () => {
    expect(resolveSiteSessionAutoSyncEnabled({
      [SITE_SESSION_AUTO_SYNC_CONFIG_KEY]: true,
    })).toBe(true);
    expect(resolveSiteSessionAutoSyncEnabled({
      [SITE_SESSION_AUTO_SYNC_CONFIG_KEY]: "true",
    })).toBe(false);
    expect(resolveSiteSessionAutoSyncEnabled({
      [SITE_SESSION_AUTO_SYNC_CONFIG_KEY]: null,
    })).toBe(false);
    expect(resolveSiteSessionAutoSyncEnabled({})).toBe(false);
  });

  it("dismisses discovery only for a boolean true config value", () => {
    expect(resolveSiteSessionDiscoveryDismissed({
      [SITE_SESSION_DISCOVERY_DISMISSED_CONFIG_KEY]: true,
    })).toBe(true);
    expect(resolveSiteSessionDiscoveryDismissed({
      [SITE_SESSION_DISCOVERY_DISMISSED_CONFIG_KEY]: "true",
    })).toBe(false);
    expect(resolveSiteSessionDiscoveryDismissed({
      [SITE_SESSION_DISCOVERY_DISMISSED_CONFIG_KEY]: null,
    })).toBe(false);
    expect(resolveSiteSessionDiscoveryDismissed({})).toBe(false);
  });

  it("falls back to disabled preferences for invalid config strings", () => {
    expect(resolveSiteSessionAutoSyncEnabledFromConfigString("{")).toBe(false);
    expect(resolveSiteSessionAutoSyncEnabledFromConfigString("[]")).toBe(false);
    expect(resolveSiteSessionDiscoveryDismissedFromConfigString("{")).toBe(false);
    expect(resolveSiteSessionDiscoveryDismissedFromConfigString("null")).toBe(false);
  });
});
