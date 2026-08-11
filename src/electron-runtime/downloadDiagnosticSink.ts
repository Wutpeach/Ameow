import type {
  DownloadDiagnosticEvent,
  DownloadDiagnosticSink,
} from "../application/download-diagnostics.js";
import type { RuntimeLogger } from "./contracts.js";

/** Existing session runtime-log adapter; events are already closed/allowlisted. */
export const createRuntimeLogDownloadDiagnosticSink = (
  logger: RuntimeLogger,
): DownloadDiagnosticSink => ({
  record(event: DownloadDiagnosticEvent): void {
    logger.log(`>>> [DownloadDiagnostic] ${JSON.stringify(event)}`);
  },
});
