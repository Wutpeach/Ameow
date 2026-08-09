/**
 * Core-owned download progress value. Structurally identical to the protocol
 * `DownloadProgressPayload` today; the runtime boundary maps it explicitly
 * (`toDownloadProgressPayload`) so protocol keys can drift without leaking
 * into Domain/Application.
 */
export type DownloadStage =
  | "preparing"
  | "downloading"
  | "merging"
  | "post_processing";

export type DownloadProgress = {
  traceId: string;
  percent: number;
  stage: DownloadStage;
  speed: string;
  eta: string;
};
