import type { DownloadEngine } from "../core/index.js";
import { GalleryDlEngine } from "./gallery-dl.js";
import { YtDlpEngine } from "./yt-dlp.js";

export const builtinEngines = (): DownloadEngine[] => [
  new YtDlpEngine(),
  new GalleryDlEngine(),
];

export * from "./engine-registry.js";
export * from "./yt-dlp.js";
export * from "./gallery-dl.js";
