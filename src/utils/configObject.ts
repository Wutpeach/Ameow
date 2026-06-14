export type ConfigObject = Record<string, unknown>;

export const parseConfigObject = (configStr: string): ConfigObject => {
  try {
    const parsed = JSON.parse(configStr) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return parsed as ConfigObject;
  } catch {
    return {};
  }
};
