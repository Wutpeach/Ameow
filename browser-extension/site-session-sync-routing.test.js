import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const backgroundSource = readFileSync(
  path.resolve("browser-extension/background.js"),
  "utf8",
);

describe("site session sync routing", () => {
  it("routes popup site-session sync through the desktop-owned request action", () => {
    expect(backgroundSource).toContain("'site_session_sync_request'");
    expect(backgroundSource).not.toContain("'site_session_cookie_sync_direct'");
  });
});
