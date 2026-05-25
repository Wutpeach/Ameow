import { desktopCommands } from "./runtime";
import {
  parseDesktopAppConfig,
  type DesktopAppConfig,
} from "../updates/appUpdatePreferences";

export type ConfigObjectPatch =
  | Partial<DesktopAppConfig>
  | ((draft: DesktopAppConfig) => void);

export const parseConfigObject = parseDesktopAppConfig;

export const loadConfigObject = async (): Promise<DesktopAppConfig> => {
  const configStr = await desktopCommands.invoke<string>("get_config");
  return parseConfigObject(configStr);
};

export const patchConfigObject = (
  config: DesktopAppConfig,
  patch: ConfigObjectPatch,
): DesktopAppConfig => {
  const nextConfig: DesktopAppConfig = { ...config };

  if (typeof patch === "function") {
    patch(nextConfig);
    return nextConfig;
  }

  return {
    ...nextConfig,
    ...patch,
  };
};

export const saveConfigPatch = async (
  patch: ConfigObjectPatch,
): Promise<DesktopAppConfig> => {
  const config = await loadConfigObject();
  const nextConfig = patchConfigObject(config, patch);

  await desktopCommands.invoke<void>("save_config", {
    json: JSON.stringify(nextConfig),
  });

  return nextConfig;
};
