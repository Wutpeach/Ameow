/**
 * Core-owned download outcome. Domain naming only (`filePath`, not the
 * protocol `file_path`); the runtime/protocol boundary maps this to
 * `DownloadResultPayload` via `toDownloadResultPayload`.
 */
export type DownloadResult = {
  traceId: string;
  success: boolean;
  filePath?: string;
  title?: string;
  error?: string;
};
