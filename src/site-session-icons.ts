export {
  BilibiliLogo,
  DouyinLogo,
  InstagramLogo,
  XiaohongshuLogo,
  YouTubeLogo,
} from "./components/icons/SiteLogos";

import type { ComponentType } from "react";

import {
  BilibiliLogo,
  DouyinLogo,
  InstagramLogo,
  XiaohongshuLogo,
  YouTubeLogo,
} from "./components/icons/SiteLogos";

export const SITE_SESSION_LOGOS: Partial<Record<string, ComponentType<{ size?: number }>>> = {
  douyin: DouyinLogo,
  bilibili: BilibiliLogo,
  xiaohongshu: XiaohongshuLogo,
  instagram: InstagramLogo,
  youtube: YouTubeLogo,
};
