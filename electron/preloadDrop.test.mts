import { describe, expect, it, vi } from "vitest";

import {
  hasLocalFileItems,
  resolveLocalFilePathsFromDataTransfer,
  resolveLocalPathFromDataTransfer,
  resolvePendingFolderDrop,
} from "./preloadDrop.mjs";

const createDataTransfer = (overrides: {
  files?: unknown[];
  items?: Array<{ kind?: string; getAsFile?: () => unknown | null }>;
  data?: Record<string, string>;
} = {}) => ({
  files: overrides.files ?? [],
  items: overrides.items ?? [],
  getData(type: string) {
    return overrides.data?.[type] ?? "";
  },
});

describe("hasLocalFileItems", () => {
  it("detects file items exposed through DataTransfer.items", () => {
    expect(hasLocalFileItems(createDataTransfer({
      items: [{ kind: "file" }],
    }))).toBe(true);
  });

  it("returns false when the drop does not expose any file-like items", () => {
    expect(hasLocalFileItems(createDataTransfer({
      items: [{ kind: "string" }],
      data: { "text/plain": "https://weibo.com/detail/123" },
    }))).toBe(false);
  });
});

describe("resolveLocalPathFromDataTransfer", () => {
  it("prefers resolved native file-system paths from file-like items", () => {
    const file = { id: "native-file" };

    expect(resolveLocalPathFromDataTransfer(createDataTransfer({
      items: [{ kind: "file", getAsFile: () => file }],
    }), (candidate) => candidate === file ? "C:\\Users\\Test\\Export" : null))
      .toBe("C:\\Users\\Test\\Export");
  });

  it("falls back to local file URIs exposed through drag text payloads", () => {
    expect(resolveLocalPathFromDataTransfer(createDataTransfer({
      items: [{ kind: "file", getAsFile: () => ({}) }],
      data: { "text/uri-list": "file:///C:/Users/Test/Export%20Folder" },
    }), () => null)).toBe("C:\\Users\\Test\\Export Folder");
  });
});

describe("resolveLocalFilePathsFromDataTransfer", () => {
  it("returns all unique native file-system paths from file-like items", () => {
    const firstFile = { id: "first" };
    const secondFile = { id: "second" };

    expect(resolveLocalFilePathsFromDataTransfer(createDataTransfer({
      items: [
        { kind: "file", getAsFile: () => firstFile },
        { kind: "file", getAsFile: () => secondFile },
      ],
      files: [firstFile],
    }), (candidate) => {
      if (candidate === firstFile) {
        return "C:\\Users\\Test\\first.png";
      }
      if (candidate === secondFile) {
        return "C:\\Users\\Test\\second.mp4";
      }
      return null;
    })).toEqual([
      "C:\\Users\\Test\\first.png",
      "C:\\Users\\Test\\second.mp4",
    ]);
  });

  it("falls back to one local path from drag text payloads", () => {
    expect(resolveLocalFilePathsFromDataTransfer(createDataTransfer({
      data: { "text/uri-list": "file:///C:/Users/Test/example.png" },
    }), () => null)).toEqual(["C:\\Users\\Test\\example.png"]);
  });

  it("falls back to multiple local paths from drag text payloads", () => {
    expect(resolveLocalFilePathsFromDataTransfer(createDataTransfer({
      data: {
        "text/uri-list": [
          "# comment",
          "file:///C:/Users/Test/first.png",
          "file:///C:/Users/Test/second.png",
        ].join("\n"),
      },
    }), () => null)).toEqual([
      "C:\\Users\\Test\\first.png",
      "C:\\Users\\Test\\second.png",
    ]);
  });
});

describe("resolvePendingFolderDrop", () => {
  it("returns null for browser file-like drags without a resolvable local path", async () => {
    const validateDroppedFolderPath = vi.fn();

    await expect(resolvePendingFolderDrop(createDataTransfer({
      items: [{ kind: "file", getAsFile: () => ({}) }],
      files: [{}],
      data: {
        "text/plain": "https://weibo.com/detail/4913212871149937",
        "text/uri-list": "about:blank#blocked",
      },
    }), {
      resolvePathFromFile: () => null,
      validateDroppedFolderPath,
    })).resolves.toBeNull();

    expect(validateDroppedFolderPath).not.toHaveBeenCalled();
  });

  it("validates true local folder drops once a native path is available", async () => {
    const validateDroppedFolderPath = vi.fn(async (path: string) => ({
      success: true as const,
      path,
      name: "Export",
    }));

    await expect(resolvePendingFolderDrop(createDataTransfer({
      items: [{ kind: "file", getAsFile: () => ({ id: "folder" }) }],
    }), {
      resolvePathFromFile: () => "C:\\Users\\Test\\Export",
      validateDroppedFolderPath,
    })).resolves.toEqual({
      success: true,
      path: "C:\\Users\\Test\\Export",
      name: "Export",
    });

    expect(validateDroppedFolderPath).toHaveBeenCalledWith("C:\\Users\\Test\\Export");
  });

  it("prefers a folder from mixed native file and folder drops", async () => {
    const validateDroppedFolderPath = vi.fn(async (path: string) => (
      path.endsWith("\\Export")
        ? {
            success: true as const,
            path,
            name: "Export",
          }
        : {
            success: false as const,
            path,
            error: "Dropped item is not a folder.",
            reason: "NOT_DIRECTORY" as const,
          }
    ));

    await expect(resolvePendingFolderDrop(createDataTransfer({
      items: [
        { kind: "file", getAsFile: () => ({ id: "file" }) },
        { kind: "file", getAsFile: () => ({ id: "folder" }) },
      ],
    }), {
      resolvePathFromFile: (candidate) => (
        (candidate as { id?: string }).id === "folder"
          ? "C:\\Users\\Test\\Export"
          : "C:\\Users\\Test\\image.png"
      ),
      validateDroppedFolderPath,
    })).resolves.toEqual({
      success: true,
      path: "C:\\Users\\Test\\Export",
      name: "Export",
    });

    expect(validateDroppedFolderPath).toHaveBeenCalledTimes(2);
  });

  it("surfaces preload validation failures once a local path has been resolved", async () => {
    await expect(resolvePendingFolderDrop(createDataTransfer({
      files: [{ id: "folder" }],
    }), {
      resolvePathFromFile: () => "C:\\Users\\Test\\Export",
      validateDroppedFolderPath: async () => {
        throw new Error("IPC unavailable");
      },
    })).resolves.toEqual({
      success: false,
      path: "C:\\Users\\Test\\Export",
      error: "Failed to validate the dropped folder.",
      reason: "PRELOAD_ERROR",
    });
  });
});
