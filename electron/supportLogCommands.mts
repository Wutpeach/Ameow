import type { AmeowRendererCommand } from "../src/types/electronBridge.js";

type CommandPayload = Record<string, unknown> | undefined;

export type SupportLogCommandController = {
  supports(command: AmeowRendererCommand): boolean;
  invoke<TResult>(
    command: AmeowRendererCommand,
    payload?: Record<string, unknown>,
  ): Promise<TResult>;
};

export type SupportLogCommandControllerOptions = {
  exportSupportLog(): Promise<string>;
};

const supportedCommands = new Set<AmeowRendererCommand>([
  "export_support_log",
]);

export const createSupportLogCommandController = (
  options: SupportLogCommandControllerOptions,
): SupportLogCommandController => ({
  supports(command) {
    return supportedCommands.has(command);
  },

  async invoke<TResult>(
    command: AmeowRendererCommand,
    _payload?: CommandPayload,
  ): Promise<TResult> {
    switch (command) {
      case "export_support_log":
        return await options.exportSupportLog() as TResult;
      default:
        throw new Error(`Unsupported Electron command: ${command}`);
    }
  },
});
