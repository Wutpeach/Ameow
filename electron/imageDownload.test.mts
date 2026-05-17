import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import {
  deriveImageDownloadHeaders,
  downloadImage,
  saveDataUrl,
} from "./imageDownload.mjs";

const createDependencies = (overrides = {}) => ({
  readConfigObject: vi.fn(async () => ({ renameEnabled: false })),
  resolveCurrentOutputFolderPath: vi.fn(async () => "/tmp/Ameow"),
  resolveRenameEnabled: vi.fn((config) => config.renameEnabled === true),
  buildRenamedTargetPath: vi.fn(async (targetDir, extension) => ({
    stem: "AMEOW-001",
    filePath: join(targetDir, `AMEOW-001.${extension}`),
  })),
  releaseRenameStem: vi.fn(),
  requestProtectedImageResolution: vi.fn(),
  fetchWithDesktopSession: vi.fn(),
  logInfo: vi.fn(),
  ...overrides,
});

const createImageResponse = (body = "image-bytes", contentType = "image/png") => ({
  ok: true,
  status: 200,
  statusText: "OK",
  headers: new Headers({ "content-type": contentType }),
  body: Readable.from([body]),
});

describe("deriveImageDownloadHeaders", () => {
  it("allows only supported request headers and derives referer/origin", () => {
    expect(deriveImageDownloadHeaders({
      url: "https://cdn.example.com/image.png",
      referrer: "https://example.com/page?id=1",
      requestHeaders: {
        Accept: " image/webp ",
        Cookie: " session=1 ",
        Authorization: "Bearer secret",
        "User-Agent": "",
      },
    })).toEqual({
      Accept: "image/webp",
      Cookie: "session=1",
      Referer: "https://example.com/page?id=1",
      Origin: "https://example.com",
    });
  });

  it("strips referer and origin for Twitter/X public image requests", () => {
    expect(deriveImageDownloadHeaders({
      url: "https://pbs.twimg.com/media/abc.jpg",
      referrer: "https://x.com/user/status/1",
      requestHeaders: {
        Referer: "https://x.com/user/status/1",
        Origin: "https://x.com",
        Accept: "image/*",
      },
    })).toEqual({
      Accept: "image/*",
    });
  });

  it("keeps Xiaohongshu protected-image origin but avoids referer", () => {
    expect(deriveImageDownloadHeaders({
      url: "https://sns-img-qc.xhscdn.com/image",
      referrer: "https://www.xiaohongshu.com/explore/abc",
    })).toEqual({
      Origin: "https://www.xiaohongshu.com",
    });
  });
});

describe("downloadImage", () => {
  it("saves a fetched image using the URL name and collision suffix", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "ameow-image-download-"));
    try {
      await writeFile(join(targetDir, "photo.png"), "existing");
      const dependencies = createDependencies({
        fetchWithDesktopSession: vi.fn(async () => createImageResponse("saved")),
      });

      const filePath = await downloadImage(
        "https://cdn.example.com/photo.png?size=large",
        targetDir,
        null,
        null,
        {},
        dependencies,
      );

      expect(filePath).toBe(join(targetDir, "photo_2.png"));
      await expect(readFile(filePath, "utf8")).resolves.toBe("saved");
    } finally {
      await rm(targetDir, { recursive: true, force: true });
    }
  });

  it("uses rename allocation and releases the reserved stem after save", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "ameow-image-rename-"));
    try {
      const dependencies = createDependencies({
        readConfigObject: vi.fn(async () => ({ renameEnabled: true })),
        fetchWithDesktopSession: vi.fn(async () => createImageResponse("renamed", "image/jpeg")),
      });

      const filePath = await downloadImage(
        "https://cdn.example.com/photo",
        targetDir,
        "Original Name.jpeg",
        null,
        {},
        dependencies,
      );

      expect(filePath).toBe(join(targetDir, "AMEOW-001.jpeg"));
      await expect(readFile(filePath, "utf8")).resolves.toBe("renamed");
      expect(dependencies.buildRenamedTargetPath).toHaveBeenCalledWith(
        targetDir,
        "jpeg",
        { renameEnabled: true },
      );
      expect(dependencies.releaseRenameStem).toHaveBeenCalledWith(targetDir, "AMEOW-001");
    } finally {
      await rm(targetDir, { recursive: true, force: true });
    }
  });

  it("uses protected-image fallback only after primary download failure", async () => {
    const dependencies = createDependencies({
      fetchWithDesktopSession: vi.fn(async () => ({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        headers: new Headers(),
        body: null,
      })),
      requestProtectedImageResolution: vi.fn(async () => ({
        success: true,
        filePath: "/tmp/resolved.png",
      })),
    });

    await expect(downloadImage(
      "https://cdn.example.com/protected.png",
      "/tmp/target",
      null,
      { token: "token-1", pageUrl: "https://example.com/page" },
      {},
      dependencies,
    )).resolves.toBe("/tmp/resolved.png");

    expect(dependencies.requestProtectedImageResolution).toHaveBeenCalledWith({
      token: "token-1",
      pageUrl: "https://example.com/page",
      imageUrl: "https://cdn.example.com/protected.png",
      targetDir: "/tmp/target",
    });
  });
});

describe("saveDataUrl", () => {
  it("saves data URLs with collision-safe filenames when rename is disabled", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "ameow-data-url-"));
    try {
      await writeFile(join(targetDir, "clip.webp"), "existing");
      const dependencies = createDependencies();
      const filePath = await saveDataUrl(
        "data:image/webp;base64,c2F2ZWQ=",
        targetDir,
        "clip.webp",
        {},
        dependencies,
      );

      expect(filePath).toBe(join(targetDir, "clip_2.webp"));
      await expect(readFile(filePath, "utf8")).resolves.toBe("saved");
    } finally {
      await rm(targetDir, { recursive: true, force: true });
    }
  });

  it("requires rename mode when requested and saves through the rename allocator", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "ameow-data-url-rename-"));
    try {
      const dependencies = createDependencies({
        readConfigObject: vi.fn(async () => ({ renameEnabled: true })),
      });

      const filePath = await saveDataUrl(
        "data:image/png;base64,cmVuYW1lZA==",
        targetDir,
        null,
        { requireRenameEnabled: true },
        dependencies,
      );

      expect(filePath).toBe(join(targetDir, "AMEOW-001.png"));
      await expect(readFile(filePath, "utf8")).resolves.toBe("renamed");
      expect(dependencies.releaseRenameStem).toHaveBeenCalledWith(targetDir, "AMEOW-001");
    } finally {
      await rm(targetDir, { recursive: true, force: true });
    }
  });

  it("rejects save_data_url requests that require disabled rename mode", async () => {
    const dependencies = createDependencies();

    await expect(saveDataUrl(
      "data:image/png;base64,c2F2ZWQ=",
      "/tmp/Ameow",
      null,
      { requireRenameEnabled: true },
      dependencies,
    )).rejects.toThrow("rename_disabled");
  });
});
