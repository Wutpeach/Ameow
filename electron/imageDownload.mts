import { createWriteStream } from "node:fs";
import http from "node:http";
import https from "node:https";
import { access, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, parse } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { normalizeVideoPageUrl } from "./videoHintNormalization.mjs";

type HeaderMap = Record<string, string>;

type HeaderBag = {
  get(name: string): string | null;
};

type ImageDownloadResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  url?: string;
  headers: HeaderBag;
  body: ReadableStream<Uint8Array> | NodeJS.ReadableStream | null;
};

type FetchImageForDownloadOptions = {
  requestHeaders?: unknown;
  headers?: unknown;
  referrer?: unknown;
  pageUrl?: unknown;
  fetch?: typeof fetch;
  logInfo?(scope: string, message: string, details?: string): void;
};

type RenameTarget = {
  stem: string;
  filePath: string;
};

type ProtectedImageFallback = {
  token?: unknown;
  imageUrl?: unknown;
  pageUrl?: unknown;
  [key: string]: unknown;
};

type ProtectedImageResolution = {
  success?: boolean;
  filePath?: string | null;
  error?: string | null;
  code?: string | null;
};

export type ImageDownloadOptions = {
  readConfigObject(): Promise<Record<string, unknown>>;
  resolveCurrentOutputFolderPath(): Promise<string>;
  resolveRenameEnabled(config: Record<string, unknown>): boolean;
  buildRenamedTargetPath(
    targetDir: string,
    extension: string,
    config: Record<string, unknown>,
  ): Promise<RenameTarget>;
  releaseRenameStem(targetDir: string, stem: string): void;
  requestProtectedImageResolution(
    payload: ProtectedImageFallback & { imageUrl: unknown; targetDir: string | null | undefined },
  ): Promise<ProtectedImageResolution>;
  fetchWithDesktopSession: typeof fetch;
  logInfo(scope: string, message: string, details?: string): void;
};

type DownloadImageRequestOptions = {
  requestHeaders?: unknown;
  headers?: unknown;
  referrer?: unknown;
  pageUrl?: unknown;
};

type SaveDataUrlOptions = {
  requireRenameEnabled?: boolean;
};

const ALLOWED_IMAGE_DOWNLOAD_REQUEST_HEADERS = new Set([
  "accept",
  "cookie",
  "origin",
  "referer",
  "user-agent",
]);

const normalizeOptionalString = (value: unknown): string | null => (
  typeof value === "string" && value.trim() ? value.trim() : null
);

const normalizeHttpUrl = (value: unknown): string | null => {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }

  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
};

const isTwitterXPublicImageRequest = (imageUrl: string, referrer: string): boolean => {
  try {
    const imageHost = new URL(imageUrl).hostname.toLowerCase();
    const referrerHost = new URL(referrer).hostname.toLowerCase();
    return /(?:^|\.)pbs\.twimg\.com$/i.test(imageHost)
      && (/(?:^|\.)x\.com$/i.test(referrerHost) || /(?:^|\.)twitter\.com$/i.test(referrerHost));
  } catch {
    return false;
  }
};

const isXiaohongshuProtectedImageRequest = (imageUrl: string, referrer: string): boolean => {
  try {
    const imageHost = new URL(imageUrl).hostname.toLowerCase();
    const referrerHost = new URL(referrer).hostname.toLowerCase();
    return /(?:^|\.)xhscdn\.com$/i.test(imageHost)
      && (/(?:^|\.)xiaohongshu\.com$/i.test(referrerHost) || /(?:^|\.)xhslink\.com$/i.test(referrerHost));
  } catch {
    return false;
  }
};

export const normalizeImageDownloadRequestHeaders = (rawHeaders: unknown): HeaderMap | undefined => {
  if (!rawHeaders || typeof rawHeaders !== "object" || Array.isArray(rawHeaders)) {
    return undefined;
  }

  const headers: HeaderMap = {};
  for (const [rawName, rawValue] of Object.entries(rawHeaders)) {
    const name = typeof rawName === "string" ? rawName.trim() : "";
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    if (!name || !value) {
      continue;
    }

    if (!ALLOWED_IMAGE_DOWNLOAD_REQUEST_HEADERS.has(name.toLowerCase())) {
      continue;
    }

    headers[name] = value;
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
};

export const deriveImageDownloadHeaders = (
  requestOptions: DownloadImageRequestOptions & { url?: unknown } = {},
): HeaderMap | undefined => {
  const normalizedImageUrl = normalizeHttpUrl(requestOptions.url);
  const headers: HeaderMap = {
    ...(normalizeImageDownloadRequestHeaders(
      requestOptions.requestHeaders ?? requestOptions.headers,
    ) ?? {}),
  };
  const normalizedReferrer = normalizeVideoPageUrl(
    requestOptions.referrer ?? requestOptions.pageUrl,
  ) ?? normalizeHttpUrl(requestOptions.referrer ?? requestOptions.pageUrl) ?? undefined;
  const twitterXPublicImageRequest = normalizedImageUrl && normalizedReferrer
    ? isTwitterXPublicImageRequest(normalizedImageUrl, normalizedReferrer)
    : false;
  const xiaohongshuProtectedImageRequest = normalizedImageUrl && normalizedReferrer
    ? isXiaohongshuProtectedImageRequest(normalizedImageUrl, normalizedReferrer)
    : false;

  if (twitterXPublicImageRequest) {
    delete headers.Referer;
    delete headers.referer;
    delete headers.Origin;
    delete headers.origin;
    return Object.keys(headers).length > 0 ? headers : undefined;
  }

  if (normalizedReferrer && !xiaohongshuProtectedImageRequest && !headers.Referer && !headers.referer) {
    headers.Referer = normalizedReferrer;
  }

  if (!headers.Origin && !headers.origin && normalizedReferrer) {
    try {
      headers.Origin = xiaohongshuProtectedImageRequest
        ? "https://www.xiaohongshu.com"
        : new URL(normalizedReferrer).origin;
    } catch {
      // Ignore invalid referrer values after normalization failure.
    }
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
};

export const createHeaderBagFromNodeResponseHeaders = (
  headers: http.IncomingHttpHeaders = {},
): HeaderBag => {
  const normalized = new Map<string, string>();
  for (const [key, value] of Object.entries(headers)) {
    const normalizedKey = key.toLowerCase();
    const normalizedValue = Array.isArray(value)
      ? value.join(", ")
      : typeof value === "string"
        ? value
        : typeof value === "number"
          ? String(value)
          : "";
    normalized.set(normalizedKey, normalizedValue);
  }

  return {
    get(name) {
      return normalized.get(name.toLowerCase()) ?? null;
    },
  };
};

export const fetchImageWithNodeRequest = async (
  url: string,
  headers?: HeaderMap,
  redirectCount = 0,
): Promise<ImageDownloadResponse> => {
  if (redirectCount > 5) {
    throw new Error("Too many redirects while downloading image");
  }

  const parsed = new URL(url);
  const transport = parsed.protocol === "https:" ? https : http;

  return await new Promise((resolve, reject) => {
    const request = transport.request(parsed, {
      method: "GET",
      headers,
    }, (response) => {
      const statusCode = response.statusCode ?? 0;
      const locationHeader = typeof response.headers.location === "string"
        ? response.headers.location
        : Array.isArray(response.headers.location)
          ? response.headers.location[0]
          : undefined;

      if (
        locationHeader
        && [301, 302, 303, 307, 308].includes(statusCode)
      ) {
        response.resume();
        const nextUrl = new URL(locationHeader, parsed).toString();
        void fetchImageWithNodeRequest(nextUrl, headers, redirectCount + 1)
          .then(resolve)
          .catch(reject);
        return;
      }

      resolve({
        ok: statusCode >= 200 && statusCode < 300,
        status: statusCode,
        statusText: response.statusMessage ?? "",
        url: parsed.toString(),
        headers: createHeaderBagFromNodeResponseHeaders(response.headers),
        body: response,
      });
    });

    request.on("error", reject);
    request.end();
  });
};

export const fetchImageForDownload = async (
  url: string,
  requestOptions: FetchImageForDownloadOptions = {},
): Promise<ImageDownloadResponse | Response> => {
  const headers = deriveImageDownloadHeaders({
    ...requestOptions,
    url,
  });
  const hasExplicitHeaders = Boolean(headers && Object.keys(headers).length > 0);
  const normalizedReferrer =
    normalizeVideoPageUrl(requestOptions.referrer ?? requestOptions.pageUrl)
    ?? normalizeHttpUrl(requestOptions.referrer ?? requestOptions.pageUrl)
    ?? undefined;
  const twitterXPublicImageRequest = normalizedReferrer
    ? isTwitterXPublicImageRequest(url, normalizedReferrer)
    : false;
  const useOriginOnlyXiaohongshuReferrer = normalizedReferrer
    ? isXiaohongshuProtectedImageRequest(url, normalizedReferrer)
    : false;
  const fetchWithDesktopSession = requestOptions.fetch ?? globalThis.fetch;
  const logInfo = requestOptions.logInfo ?? (() => undefined);

  if (hasExplicitHeaders && typeof globalThis.fetch === "function") {
    try {
      logInfo(
        "ProtectedImage",
        "Trying global fetch with explicit request headers",
        JSON.stringify({
          url,
          headerNames: Object.keys(headers ?? {}),
        }),
      );
      const response = await globalThis.fetch(url, {
        headers,
        redirect: "follow",
      });
      if (response.ok && response.body) {
        return response;
      }
      logInfo(
        "ProtectedImage",
        "Global fetch did not return a usable image response; falling back to Electron session fetch",
        JSON.stringify({
          url,
          status: response.status,
          statusText: response.statusText,
        }),
      );
    } catch (error) {
      logInfo(
        "ProtectedImage",
        "Global fetch with explicit request headers failed; falling back to Electron session fetch",
        String(error),
      );
    }
  }

  try {
    return await fetchWithDesktopSession(url, {
      credentials: "include",
      headers,
      referrer: (useOriginOnlyXiaohongshuReferrer || twitterXPublicImageRequest) ? "" : normalizedReferrer,
      referrerPolicy: useOriginOnlyXiaohongshuReferrer
        ? "no-referrer"
        : twitterXPublicImageRequest
          ? "no-referrer"
          : "strict-origin-when-cross-origin",
    });
  } catch (error) {
    logInfo(
      "ProtectedImage",
      "Electron session fetch failed; falling back to Node HTTP request",
      String(error),
    );
    return await fetchImageWithNodeRequest(url, headers);
  }
};

export const sanitizeFileNameSegment = (value: unknown): string => (
  String(value ?? "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/[\r\n\t]/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 160)
);

export const ensureExtension = (extension: string, fallback = "bin"): string => {
  const normalized = extension.replace(/^\./, "").trim();
  return normalized || fallback;
};

const pathExists = async (targetPath: string): Promise<boolean> => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
};

export const buildUniqueTargetPath = async (
  targetDir: string,
  preferredName: unknown,
  extension: string,
): Promise<string> => {
  await mkdir(targetDir, { recursive: true });
  const safeBaseName = sanitizeFileNameSegment(preferredName) || "ameow";
  const safeExtension = ensureExtension(extension);
  const directPath = join(targetDir, `${safeBaseName}.${safeExtension}`);
  if (!(await pathExists(directPath))) {
    return directPath;
  }

  for (let index = 2; index < 10_000; index += 1) {
    const candidate = join(targetDir, `${safeBaseName}_${index}.${safeExtension}`);
    if (!(await pathExists(candidate))) {
      return candidate;
    }
  }

  throw new Error(`Failed to resolve a unique file path for ${safeBaseName}.${safeExtension}`);
};

const inferExtensionFromUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    const extension = extname(parsed.pathname);
    return ensureExtension(extension, "png");
  } catch {
    return "png";
  }
};

const inferNameFromUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    const fileName = basename(parsed.pathname);
    const stem = parse(fileName).name;
    return sanitizeFileNameSegment(stem) || "ameow";
  } catch {
    return "ameow";
  }
};

const inferExtensionFromMime = (mimeType: string): string => {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/bmp":
      return "bmp";
    case "image/svg+xml":
      return "svg";
    case "image/png":
    default:
      return "png";
  }
};

const toPipelineSource = (
  body: ReadableStream<Uint8Array> | NodeJS.ReadableStream,
): NodeJS.ReadableStream => {
  if (typeof (body as NodeJS.ReadableStream).pipe === "function") {
    return body as NodeJS.ReadableStream;
  }

  return Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]);
};

export const downloadImage = async (
  url: string,
  targetDir: string | null | undefined,
  originalFilename: string | null | undefined,
  protectedImageFallback: ProtectedImageFallback | null = null,
  requestOptions: DownloadImageRequestOptions = {},
  options: ImageDownloadOptions,
): Promise<string> => {
  try {
    const response = await fetchImageForDownload(url, {
      ...requestOptions,
      fetch: options.fetchWithDesktopSession,
      logInfo: options.logInfo,
    });
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }

    const config = await options.readConfigObject();
    const renameEnabled = options.resolveRenameEnabled(config);
    const finalTargetDir = targetDir || (await options.resolveCurrentOutputFolderPath());
    const mimeType = response.headers.get("content-type")?.split(";")[0].trim() || "image/png";
    const extension = originalFilename
      ? ensureExtension(extname(originalFilename), inferExtensionFromMime(mimeType))
      : inferExtensionFromUrl(url) || inferExtensionFromMime(mimeType);
    const preferredName = originalFilename
      ? parse(originalFilename).name
      : inferNameFromUrl(url);
    let renamedStem: string | null = null;

    try {
      if (renameEnabled) {
        const renamedTarget = await options.buildRenamedTargetPath(finalTargetDir, extension, config);
        renamedStem = renamedTarget.stem;
        await pipeline(toPipelineSource(response.body), createWriteStream(renamedTarget.filePath));
        return renamedTarget.filePath;
      }

      const destinationPath = await buildUniqueTargetPath(finalTargetDir, preferredName, extension);
      await pipeline(toPipelineSource(response.body), createWriteStream(destinationPath));
      return destinationPath;
    } finally {
      if (renamedStem) {
        options.releaseRenameStem(finalTargetDir, renamedStem);
      }
    }
  } catch (error) {
    if (!protectedImageFallback?.token) {
      throw error;
    }

    const resolution = await options.requestProtectedImageResolution({
      ...protectedImageFallback,
      imageUrl: protectedImageFallback.imageUrl ?? url,
      targetDir,
    });
    if (resolution.success && resolution.filePath) {
      return resolution.filePath;
    }

    throw new Error(
      resolution.error
        ?? resolution.code
        ?? String(error),
    );
  }
};

export const saveDataUrl = async (
  dataUrl: string,
  targetDir: string | null | undefined,
  originalFilename: string | null | undefined,
  options: SaveDataUrlOptions = {},
  dependencies: Pick<
    ImageDownloadOptions,
    | "readConfigObject"
    | "resolveCurrentOutputFolderPath"
    | "resolveRenameEnabled"
    | "buildRenamedTargetPath"
    | "releaseRenameStem"
  >,
): Promise<string> => {
  const config = await dependencies.readConfigObject();
  if (options.requireRenameEnabled) {
    if (!dependencies.resolveRenameEnabled(config)) {
      throw new Error("rename_disabled");
    }
  }

  const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) {
    throw new Error("Invalid data URL");
  }

  const mimeType = match[1] || "image/png";
  const payload = match[2] || "";
  const buffer = Buffer.from(payload, "base64");
  const extension = originalFilename
    ? ensureExtension(extname(originalFilename), inferExtensionFromMime(mimeType))
    : inferExtensionFromMime(mimeType);
  const preferredName = originalFilename
    ? parse(originalFilename).name
    : "ameow";
  const finalTargetDir = targetDir || (await dependencies.resolveCurrentOutputFolderPath());
  const renameEnabled = dependencies.resolveRenameEnabled(config);
  let renamedStem: string | null = null;

  try {
    if (renameEnabled) {
      const renamedTarget = await dependencies.buildRenamedTargetPath(finalTargetDir, extension, config);
      renamedStem = renamedTarget.stem;
      await mkdir(dirname(renamedTarget.filePath), { recursive: true });
      await writeFile(renamedTarget.filePath, buffer);
      return renamedTarget.filePath;
    }

    const destinationPath = await buildUniqueTargetPath(finalTargetDir, preferredName, extension);
    await mkdir(dirname(destinationPath), { recursive: true });
    await writeFile(destinationPath, buffer);
    return destinationPath;
  } finally {
    if (renamedStem) {
      dependencies.releaseRenameStem(finalTargetDir, renamedStem);
    }
  }
};
