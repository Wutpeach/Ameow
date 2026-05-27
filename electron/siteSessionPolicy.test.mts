import { describe, expect, it } from "vitest";

import { evaluateSiteSessionPolicy } from "./siteSessionPolicy.mjs";

describe("evaluateSiteSessionPolicy", () => {
  it("reports no snapshot when no cookies are stored", () => {
    expect(evaluateSiteSessionPolicy({
      cookies: {},
      requiredKeys: ["ttwid"],
      loginKeys: ["sessionid"],
    })).toEqual({
      availability: "missing",
      reason: "no_snapshot",
      missingRequiredKeys: ["ttwid"],
    });
  });

  it("reports missing required cookies before login marker checks", () => {
    expect(evaluateSiteSessionPolicy({
      cookies: {
        sessionid: "session",
      },
      requiredKeys: ["ttwid"],
      loginKeys: ["sessionid"],
    })).toEqual({
      availability: "partial",
      reason: "missing_required_cookie",
      missingRequiredKeys: ["ttwid"],
    });
  });

  it("reports missing login markers when required cookies are present", () => {
    expect(evaluateSiteSessionPolicy({
      cookies: {
        ttwid: "ttwid-value",
      },
      requiredKeys: ["ttwid"],
      loginKeys: ["sessionid"],
    })).toEqual({
      availability: "partial",
      reason: "missing_login_cookie",
      missingRequiredKeys: [],
    });
  });

  it("reports ready when required cookies and login markers are present", () => {
    expect(evaluateSiteSessionPolicy({
      cookies: {
        sessionid: "session",
        ttwid: "ttwid-value",
      },
      requiredKeys: ["ttwid"],
      loginKeys: ["sessionid"],
    })).toEqual({
      availability: "ready",
      reason: "ready",
      missingRequiredKeys: [],
    });
  });
});
