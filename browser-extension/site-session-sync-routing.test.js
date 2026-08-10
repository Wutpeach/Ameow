import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const backgroundSource = readFileSync(
  path.resolve("browser-extension/background.js"),
  "utf8",
);
const portSource = readFileSync(
  path.resolve("browser-extension/desktop-port.js"),
  "utf8",
);

describe("site session sync routing", () => {
  it("routes popup site-session sync through the desktop-owned request action", () => {
    // The raw Desktop action lives at the Desktop port boundary, not in
    // background feature code or the UI.
    expect(portSource).toContain("site_session_sync_request");
    expect(backgroundSource).toContain("requestSiteSessionSync");
    expect(backgroundSource).not.toContain("site_session_cookie_sync_direct");
  });
});
