import type {
  AmeowDroppedFolderPathFailureReason,
  AmeowDroppedFolderPathResult,
} from "../types/electronBridge";

const droppedFolderErrorKeyByReason: Record<
  AmeowDroppedFolderPathFailureReason,
  string
> = {
  EMPTY_PATH: "app.drop.errors.unresolved",
  UNRESOLVED_DROP: "app.drop.errors.unresolved",
  PRELOAD_ERROR: "app.drop.errors.preloadFailed",
  NOT_DIRECTORY: "app.drop.errors.notDirectory",
  NOT_FOUND: "app.drop.errors.notFound",
  STAT_FAILED: "app.drop.errors.statFailed",
};

export const shouldHandleDroppedFolderResult = (
  result: AmeowDroppedFolderPathResult | null,
): boolean => {
  if (!result) {
    return false;
  }

  if (result.success) {
    return true;
  }

  return result.reason !== "NOT_DIRECTORY";
};

export const getDroppedFolderErrorTranslationKey = (
  reason: AmeowDroppedFolderPathFailureReason,
): string => droppedFolderErrorKeyByReason[reason];
