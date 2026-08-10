import { describe, expect, it } from "vitest";
import {
  detectSiteHintFromUrl,
  normalizeSiteHint,
  resolveSiteHint,
} from "./site-hints.js";

describe("site hint normalization", () => {
  it("maps known aliases to canonical hints", () => {
    expect(normalizeSiteHint("XHS")).toBe("xiaohongshu");
    expect(normalizeSiteHint("youtu.be")).toBe("youtube");
    expect(normalizeSiteHint("weibo.cn")).toBe("weibo");
  });

  it("preserves explicit unknown hints as safe opaque ids", () => {
    expect(normalizeSiteHint("fakesite")).toBe("fakesite");
    expect(normalizeSiteHint("my-site_2")).toBe("my-site_2");
  });

  it("rejects unsafe or blank opaque hint values", () => {
    expect(normalizeSiteHint("https://evil.example/path")).toBeUndefined();
    expect(normalizeSiteHint("a\nb")).toBeUndefined();
    expect(normalizeSiteHint("")).toBeUndefined();
    expect(normalizeSiteHint(undefined)).toBeUndefined();
    expect(normalizeSiteHint("x".repeat(65))).toBeUndefined();
  });

  it("detects known sites from urls when the value is not a safe hint", () => {
    expect(resolveSiteHint("https://weibo.com/detail/1")).toBe("weibo");
    expect(detectSiteHintFromUrl("https://youtu.be/abc123")).toBe("youtube");
  });

  it("prefers an explicit hint over url detection", () => {
    expect(resolveSiteHint("fakesite", "https://weibo.com/detail/1")).toBe("fakesite");
    expect(resolveSiteHint("twitter-x", "https://weibo.com/detail/1")).toBe("twitter-x");
  });
});
