import { desktopCommands } from "./runtime";
import {
  parseConfigObject as parseRawConfigObject,
  type ConfigObject,
} from "../utils/configObject";

export { parseConfigObject } from "../utils/configObject";

export type ConfigObjectPatch =
  | Partial<ConfigObject>
  | ((draft: ConfigObject) => void);

export const loadConfigObject = async (): Promise<ConfigObject> => {
  const configStr = await desktopCommands.invoke<string>("get_config");
  return parseRawConfigObject(configStr);
};

export const patchConfigObject = (
  config: ConfigObject,
  patch: ConfigObjectPatch,
): ConfigObject => {
  const nextConfig: ConfigObject = { ...config };

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
): Promise<ConfigObject> => {
  const config = await loadConfigObject();
  const nextConfig = patchConfigObject(config, patch);

  await desktopCommands.invoke<void>("save_config", {
    json: JSON.stringify(nextConfig),
  });

  return nextConfig;
};
