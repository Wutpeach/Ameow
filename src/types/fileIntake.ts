export type ProcessFilesOperation = "copy" | "move";

export type ProcessFilesItemStatus = "processed" | "skipped" | "failed";

export type ProcessFilesItemResult = {
  sourcePath: string;
  status: ProcessFilesItemStatus;
  reason?: string;
  targetPath?: string;
  error?: string;
};

export type ProcessFilesResult = {
  operation: ProcessFilesOperation;
  processedCount: number;
  targetDir: string;
  items: ProcessFilesItemResult[];
  message: string;
};
