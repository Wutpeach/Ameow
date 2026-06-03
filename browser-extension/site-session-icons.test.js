import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const helperPath = path.resolve("browser-extension/site-session-icons.js");
const helperSource = readFileSync(helperPath, "utf8");

const loadHelper = () => {
  const context = {
    self: {},
    globalThis: {},
  };
  vm.runInNewContext(helperSource, context, { filename: helperPath });
  return context.self.AmeowSiteSessionIcons;
};

describe("site session icon helper", () => {
  it("resolves bundled known icon paths from registry metadata", () => {
    const helper = loadHelper();

    expect(helper.resolveKnownIconKey({
      siteId: "youtube",
      icon: { kind: "known", key: "youtube" },
    })).toBe("youtube");
    expect(helper.KNOWN_ICON_PATHS.youtube).toContain("M23.498");
  });

  it("falls back to site id for local seeded sites and ignores unknown remote icons", () => {
    const helper = loadHelper();

    expect(helper.resolveKnownIconKey({ siteId: "bilibili" })).toBe("bilibili");
    expect(helper.resolveKnownIconKey({
      siteId: "site-example-com",
      icon: { kind: "favicon", url: "https://example.com/favicon.ico" },
    })).toBeNull();
  });

  it("builds deterministic placeholder labels for unknown sites", () => {
    const helper = loadHelper();

    expect(helper.placeholderLabel("example")).toBe("E");
    expect(helper.placeholderLabel("   ")).toBe("?");
  });
});
