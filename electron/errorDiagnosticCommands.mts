import type { AmeowRendererCommand } from "../src/types/electronBridge.js";
import {
  buildErrorDiagnosticCopyText,
  normalizeErrorDiagnosticCopyRequest,
} from "./errorDiagnosticCopy.mjs";

type CommandPayload = Record<string, unknown> | undefined;

export type ErrorDiagnosticCommandController = {
  supports(command: AmeowRendererCommand): boolean;
  invoke<TResult>(
    command: AmeowRendererCommand,
    payload?: Record<string, unknown>,
  ): Promise<TResult>;
};

export type ErrorDiagnosticCommandControllerOptions = {
  appVersion: string;
  platform?: string;
  arch?: string;
  writeClipboardText(text: string): void;
  saveDiagnosticText(text: string): Promise<boolean>;
  now?(): Date;
};

const supportedCommands = new Set<AmeowRendererCommand>([
  "copy_error_diagnostics",
  "export_error_diagnostics",
]);

export const createErrorDiagnosticCommandController = (
  options: ErrorDiagnosticCommandControllerOptions,
): ErrorDiagnosticCommandController => ({
  supports(command) {
    return supportedCommands.has(command);
  },

  async invoke<TResult>(
    command: AmeowRendererCommand,
    payload?: CommandPayload,
  ): Promise<TResult> {
    if (!supportedCommands.has(command)) {
      throw new Error(`Unsupported error diagnostic command: ${command}`);
    }
    const request = normalizeErrorDiagnosticCopyRequest(payload);
    const text = buildErrorDiagnosticCopyText({
      request,
      appVersion: options.appVersion,
      platform: options.platform,
      arch: options.arch,
      now: options.now,
    });
    switch (command) {
      case "copy_error_diagnostics":
        options.writeClipboardText(text);
        return true as TResult;
      case "export_error_diagnostics":
        return await options.saveDiagnosticText(text) as TResult;
      default:
        throw new Error(`Unsupported error diagnostic command: ${command}`);
    }
  },
});
