import { describe, expect, it } from "vitest";

import {
  isKnownShortLinkHost,
  isLikelyShortLinkUrl,
  normalizeHttpUrl,
  resolveUrlHostname,
} from "./short-links";

describe("short-link helpers", () => {
  it("normalizes valid HTTP(S) urls", () => {
    expect(normalizeHttpUrl(" https://t.cn/example ")).toBe("https://t.cn/example");
    expect(normalizeHttpUrl("javascript:alert(1)")).toBeUndefined();
  });

  it("recognizes known short-link hosts", () => {
    expect(isKnownShortLinkHost("t.cn")).toBe(true);
    expect(isKnownShortLinkHost("b23.tv")).toBe(true);
    expect(isKnownShortLinkHost("weibo.com")).toBe(false);
  });

  it("detects short-link urls", () => {
    expect(resolveUrlHostname("https://t.cn/example")).toBe("t.cn");
    expect(isLikelyShortLinkUrl("https://t.cn/example")).toBe(true);
    expect(isLikelyShortLinkUrl("https://weibo.com/detail/123")).toBe(false);
  });

});
