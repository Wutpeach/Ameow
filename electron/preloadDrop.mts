import { parseLocalPathFromDropText } from "./folderDrop.mjs";

type DroppedFolderPathFailureReason =
  | "EMPTY_PATH"
  | "UNRESOLVED_DROP"
  | "PRELOAD_ERROR"
  | "NOT_DIRECTORY"
  | "NOT_FOUND"
  | "STAT_FAILED";

export type DroppedFolderPathResult =
  | {
      success: true;
      path: string;
      name: string;
    }
  | {
      success: false;
      path: string;
      error: string;
      reason: DroppedFolderPathFailureReason;
    };

type FileLike = unknown;

type DataTransferItemLike = {
  kind?: string;
  getAsFile?: () => FileLike | null;
};

type DataTransferLike = {
  files?: Iterable<FileLike> | ArrayLike<FileLike> | null;
  items?: Iterable<DataTransferItemLike> | ArrayLike<DataTransferItemLike> | null;
  getData(type: string): string;
} | null | undefined;

type ResolvePathFromFile = (file: FileLike) => string | null;
type ValidateDroppedFolderPath = (path: string) => Promise<DroppedFolderPathResult>;

const getItems = <T,>(value: Iterable<T> | ArrayLike<T> | null | undefined): T[] => (
  Array.from(value ?? [])
);

export const hasLocalFileItems = (dataTransfer: DataTransferLike): boolean => (
  Boolean(dataTransfer)
  && (
    getItems(dataTransfer?.files).length > 0
    || getItems(dataTransfer?.items).some((item) => item.kind === "file")
  )
);

export const resolveLocalPathFromDataTransfer = (
  dataTransfer: DataTransferLike,
  resolvePathFromFile: ResolvePathFromFile,
): string | null => {
  return resolveLocalFilePathsFromDataTransfer(dataTransfer, resolvePathFromFile)[0] ?? null;
};

const parseLocalPathsFromDropText = (value: string | null | undefined): string[] => {
  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(/\r?\n/)
    .map((line) => parseLocalPathFromDropText(line))
    .filter((path): path is string => Boolean(path));
};

export const resolveLocalFilePathsFromDataTransfer = (
  dataTransfer: DataTransferLike,
  resolvePathFromFile: ResolvePathFromFile,
): string[] => {
  if (!dataTransfer) {
    return [];
  }

  const paths: string[] = [];
  const seen = new Set<string>();
  const addPath = (path: string | null) => {
    if (!path || seen.has(path)) {
      return;
    }
    seen.add(path);
    paths.push(path);
  };

  for (const item of getItems(dataTransfer.items)) {
    if (item.kind !== "file") {
      continue;
    }

    const file = item.getAsFile?.();
    if (!file) {
      continue;
    }

    addPath(resolvePathFromFile(file));
  }

  for (const file of getItems(dataTransfer.files)) {
    addPath(resolvePathFromFile(file));
  }

  if (paths.length > 0) {
    return paths;
  }

  for (const path of parseLocalPathsFromDropText(dataTransfer.getData("text/uri-list"))) {
    addPath(path);
  }
  for (const path of parseLocalPathsFromDropText(dataTransfer.getData("text/plain"))) {
    addPath(path);
  }

  return paths;
};

export const resolvePendingFolderDrop = async (
  dataTransfer: DataTransferLike,
  dependencies: {
    resolvePathFromFile: ResolvePathFromFile;
    validateDroppedFolderPath: ValidateDroppedFolderPath;
  },
): Promise<DroppedFolderPathResult | null> => {
  if (!hasLocalFileItems(dataTransfer)) {
    return null;
  }

  const paths = resolveLocalFilePathsFromDataTransfer(
    dataTransfer,
    dependencies.resolvePathFromFile,
  );
  if (paths.length === 0) {
    return null;
  }

  let firstFailure: DroppedFolderPathResult | null = null;
  try {
    for (const path of paths) {
      const result = await dependencies.validateDroppedFolderPath(path);
      if (result.success) {
        return result;
      }
      firstFailure ??= result;
    }
    return firstFailure;
  } catch {
    return {
      success: false,
      path: paths[0] ?? "",
      error: "Failed to validate the dropped folder.",
      reason: "PRELOAD_ERROR",
    };
  }
};
