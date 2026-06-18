import { parseConfigObject } from "./utils/configObject.js";

export const SITE_SESSION_AUTO_SYNC_CONFIG_KEY = "siteSessionAutoSyncEnabled";
export const SITE_SESSION_DISCOVERY_DISMISSED_CONFIG_KEY = "siteSessionDiscoveryDismissed";

export const resolveSiteSessionAutoSyncEnabled = (
  config: Record<string, unknown>,
): boolean => config[SITE_SESSION_AUTO_SYNC_CONFIG_KEY] === true;

export const resolveSiteSessionDiscoveryDismissed = (
  config: Record<string, unknown>,
): boolean => config[SITE_SESSION_DISCOVERY_DISMISSED_CONFIG_KEY] === true;

export const resolveSiteSessionAutoSyncEnabledFromConfigString = (
  configStr: string,
): boolean => resolveSiteSessionAutoSyncEnabled(parseConfigObject(configStr));

export const resolveSiteSessionDiscoveryDismissedFromConfigString = (
  configStr: string,
): boolean => resolveSiteSessionDiscoveryDismissed(parseConfigObject(configStr));
