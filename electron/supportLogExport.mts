import { writeFile } from "node:fs/promises";
import { join } from "node:path";

type SupportLogEnvironment = {
  appVersion: string;
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
  configPath: string;
  logDir: string;
  runtimeLogPath: string;
};

export type ExportSupportLogOptions = {
  environment: SupportLogEnvironment;
  readConfigObject(): Promise<Record<string, unknown>>;
  getRuntimeDependencyStatus(): Promise<unknown>;
  readRecentRuntimeLogLines(): Promise<string[]>;
  now?(): Date;
};

export const buildSupportLogText = async (
  options: ExportSupportLogOptions,
): Promise<string> => {
  const config = await options.readConfigObject();
  const runtimeStatus = await options.getRuntimeDependencyStatus();
  const recentRuntimeLogLines = await options.readRecentRuntimeLogLines();
  const lines = [
    "[environment]",
    `appVersion=${options.environment.appVersion}`,
    `platform=${options.environment.platform}`,
    `arch=${options.environment.arch}`,
    `configPath=${options.environment.configPath}`,
    `logDir=${options.environment.logDir}`,
    `runtimeLogPath=${options.environment.runtimeLogPath}`,
    "",
    "[settings]",
    JSON.stringify(config, null, 2),
    "",
    "[runtime]",
    JSON.stringify(runtimeStatus, null, 2),
    "",
    "[recent-runtime-log]",
    ...(recentRuntimeLogLines.length > 0 ? recentRuntimeLogLines : ["<no runtime log lines captured>"]),
    "",
  ];
  return `${lines.join("\n")}\n`;
};

export const exportSupportLogFile = async (
  options: ExportSupportLogOptions,
): Promise<string> => {
  const timestamp = (options.now?.() ?? new Date()).toISOString().replace(/[:.]/g, "-");
  const outputPath = join(options.environment.logDir, `support-${timestamp}.txt`);
  await writeFile(outputPath, await buildSupportLogText(options), "utf8");
  return outputPath;
};
