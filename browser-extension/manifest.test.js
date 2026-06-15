import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const manifestPath = path.resolve("browser-extension/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

function findContentScript(match) {
  return manifest.content_scripts.find((entry) => Array.isArray(entry.matches) && entry.matches.includes(match));
}

function findContentScriptWithJs(match, scriptName) {
  return manifest.content_scripts.find((entry) => (
    Array.isArray(entry.matches)
    && entry.matches.includes(match)
    && Array.isArray(entry.js)
    && entry.js.includes(scriptName)
  ));
}

describe("browser extension manifest", () => {
  it("does not request a global context menu permission", () => {
    expect(manifest.permissions).not.toContain("contextMenus");
  });

  it("declares the extension options page", () => {
    expect(manifest.options_page).toBe("options.html");
  });

  it("loads site-session icons before the popup renderer", () => {
    const popupHtml = readFileSync(path.resolve("browser-extension/popup.html"), "utf8");
    expect(popupHtml.indexOf("site-session-icons.js")).toBeGreaterThanOrEqual(0);
    expect(popupHtml.indexOf("site-session-icons.js")).toBeLessThan(popupHtml.indexOf("popup.js"));
  });

  it("packages the action icon indicator helper for the background worker", () => {
    const backgroundSource = readFileSync(path.resolve("browser-extension/background.js"), "utf8");
    expect(backgroundSource).toContain("\"action-icon-indicator.js\"");
    expect(backgroundSource).not.toContain("'•'");
  });

  it("registers the Twitter/X injected detector", () => {
    expect(findContentScript("https://x.com/*")).toMatchObject({
      js: ["injected-cat-icon.js", "twitter-detector.js"],
      css: ["ameow-shared.css", "twitter-button.css"],
      run_at: "document_idle",
    });
  });

  it("keeps the Bilibili injected detector registered", () => {
    expect(findContentScript("https://www.bilibili.com/*")).toMatchObject({
      js: ["locale-utils.js", "control-style-utils.js", "injected-cat-icon.js", "bilibili-detector.js"],
      css: ["ameow-shared.css", "bilibili-button.css"],
      run_at: "document_idle",
    });
  });

  it("loads the injected cat icon helper before site detectors that render cat controls", () => {
    expect(findContentScript("https://www.youtube.com/*")).toMatchObject({
      js: ["locale-utils.js", "control-style-utils.js", "injected-cat-icon.js", "youtube-detector.js"],
    });
    expect(findContentScriptWithJs("https://*.xiaohongshu.com/*", "xiaohongshu-detector.js")).toMatchObject({
      js: ["injected-cat-icon.js", "xiaohongshu-detector.js"],
    });
    expect(findContentScript("https://www.pinterest.com/*")).toMatchObject({
      js: ["injected-cat-icon.js", "pinterest-detector.js"],
    });
  });
});
