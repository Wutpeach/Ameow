export type DownloadStage =
  | "preparing"
  | "downloading"
  | "merging"
  | "post_processing";

export type DownloadProgressPayload = {
  traceId: string;
  percent: number;
  stage: DownloadStage;
  speed: string;
  eta: string;
};

export type DownloadResultPayload = {
  traceId: string;
  success: boolean;
  file_path?: string;
  title?: string;
  error?: string;
};

export type VideoQueueTaskStatus = "active" | "pending";

export type VideoQueueTaskPhase =
  | "downloading"
  | "probing_quality"
  | "selecting_quality";

export type AdvancedQualityPostProcessPlan =
  | "none"
  | "remux_only"
  | "audio_transcode"
  | "full_transcode"
  | "unknown";

export type AdvancedQualityOptionPayload = {
  id: string;
  label: string;
  tags?: string[];
  postProcessPlan?: AdvancedQualityPostProcessPlan;
};

export type VideoQueueTaskPayload = {
  traceId: string;
  label: string;
  videoTitle?: string;
  status: VideoQueueTaskStatus;
  phase?: VideoQueueTaskPhase | null;
  qualityOptions?: AdvancedQualityOptionPayload[];
};

export type VideoQueueStatePayload = {
  activeCount: number;
  pendingCount: number;
  totalCount: number;
  maxConcurrent: number;
};

export type VideoQueueDetailPayload = {
  tasks: VideoQueueTaskPayload[];
};

export type VideoTranscodeTaskStatus = "active" | "pending" | "failed";

export type VideoTranscodeStage =
  | "analyzing"
  | "transcoding"
  | "finalizing_mp4"
  | "failed";

export type VideoTranscodeQueueStatePayload = {
  activeCount: number;
  pendingCount: number;
  failedCount: number;
  totalCount: number;
  maxConcurrent: number;
};

export type VideoTranscodeTaskPayload = {
  traceId: string;
  label: string;
  status: VideoTranscodeTaskStatus;
  stage?: VideoTranscodeStage | null;
  progressPercent?: number | null;
  etaSeconds?: number | null;
  sourcePath?: string | null;
  sourceFormat?: string | null;
  targetFormat?: string | null;
  error?: string | null;
};

export type VideoTranscodeQueueDetailPayload = {
  tasks: VideoTranscodeTaskPayload[];
};

export type VideoTranscodeCompletePayload = {
  traceId: string;
  label: string;
  sourcePath: string;
  filePath: string;
  sourceFormat?: string | null;
  targetFormat: string;
};

export type VideoSelectionCandidate = {
  url: string;
  type?: string;
  source?: string;
  confidence?: string;
  mediaType?: "video" | "image";
};

export type PinterestVideoCandidate = VideoSelectionCandidate;

export type PinterestDragDiagnosticFlags = {
  hasEmbeddedPayload: boolean;
  hasVideoTag: boolean;
  hasVideoList: boolean;
  hasStoryPinData: boolean;
  hasCarouselData: boolean;
  hasMp4: boolean;
  hasM3u8: boolean;
  hasCmfv: boolean;
  hasPinimgVideoHost: boolean;
};

export type PinterestDragDiagnostic = {
  htmlLength: number;
  htmlPreview: string;
  flags: PinterestDragDiagnosticFlags;
  imageUrl: string | null;
  videoUrl: string | null;
  videoCandidatesCount: number;
  videoCandidates: PinterestVideoCandidate[];
};

export type QueuedVideoDownloadRequest = {
  url: string;
  pageUrl?: string;
  videoUrl?: string;
  videoCandidates?: VideoSelectionCandidate[];
  title?: string;
  cookies?: string;
  selectionScope?: "current_item" | "playlist";
  clipStartSec?: number;
  clipEndSec?: number;
  videoQuality?: "best" | "balanced" | "data_saver";
  siteHint?: string;
  advancedQualityRequest?: boolean;
  advancedQualitySelector?: string;
  advancedQualityLabel?: string;
  extensionData?: {
    youtube?: {
      source?: "injected" | "pasted" | "context_menu";
    };
  };
  dragDiagnostic?: PinterestDragDiagnostic;
  diagnostics?: Record<string, unknown>;
};

export type QueuedVideoDownloadAck = {
  accepted: boolean;
  traceId: string;
};

export type PinterestAsset = {
  url: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
};

export type PinterestRuntimePayload = {
  traceId: string;
  pageUrl: string;
  pinId: number;
  title: string;
  origin: string;
  cookiesHeader?: string | null;
  image: PinterestAsset;
  video?: PinterestAsset | null;
  outputDir: string;
};
