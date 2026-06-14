import { parseConfigObject } from "../utils/configObject";

export type Theme = "black" | "white";

export const DEFAULT_THEME: Theme = "black";

const isTheme = (value: unknown): value is Theme => value === "black" || value === "white";

export const resolveThemeFromConfigString = (configStr: string): Theme => {
  const config = parseConfigObject(configStr);
  return isTheme(config.theme) ? config.theme : DEFAULT_THEME;
};
