import type { DownloadEngine } from "../core/index.js";
import { DouyinDlEngine } from "./douyin-dl.js";
import { DirectEngine } from "./direct.js";
import { GalleryDlEngine } from "./gallery-dl.js";
import { YtDlpEngine } from "./yt-dlp.js";

export const builtinEngines = (): DownloadEngine[] => [
  new YtDlpEngine(),
  new GalleryDlEngine(),
  new DouyinDlEngine(),
  new DirectEngine(),
];

export * from "./engine-registry.js";
export * from "./yt-dlp.js";
export * from "./gallery-dl.js";
export * from "./douyin-dl.js";
export * from "./direct.js";
