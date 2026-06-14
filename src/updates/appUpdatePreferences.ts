import { parseConfigObject } from "../utils/configObject.js";

export const APP_UPDATE_PRERELEASE_CONFIG_KEY = "receivePrereleaseUpdates";

export type { ConfigObject as DesktopAppConfig } from "../utils/configObject.js";

export { parseConfigObject as parseDesktopAppConfig } from "../utils/configObject.js";

export const resolveReceivePrereleaseUpdates = (
  config: Record<string, unknown>,
): boolean => config[APP_UPDATE_PRERELEASE_CONFIG_KEY] === true;

export const resolveReceivePrereleaseUpdatesFromConfigString = (
  configStr: string,
): boolean => resolveReceivePrereleaseUpdates(parseConfigObject(configStr));
