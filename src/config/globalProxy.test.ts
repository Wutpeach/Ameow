import { describe, expect, it } from "vitest";

import {
  GLOBAL_PROXY_ENABLED_CONFIG_KEY,
  GLOBAL_PROXY_URL_CONFIG_KEY,
  describeGlobalProxyValidationError,
  resolveGlobalProxyEnabled,
  resolveStoredGlobalProxyUrl,
  validateGlobalProxySettings,
} from "./globalProxy";

describe("global proxy settings", () => {
  it("treats proxy as disabled by default", () => {
    expect(resolveGlobalProxyEnabled({})).toBe(false);
    expect(resolveStoredGlobalProxyUrl({})).toBe("");
    expect(validateGlobalProxySettings({})).toEqual({
      enabled: false,
      normalizedUrl: null,
      errorCode: null,
    });
  });

  it("normalizes valid fixed proxy URLs", () => {
    expect(validateGlobalProxySettings({
      [GLOBAL_PROXY_ENABLED_CONFIG_KEY]: true,
      [GLOBAL_PROXY_URL_CONFIG_KEY]: " http://127.0.0.1:7897/ ",
    })).toEqual({
      enabled: true,
      normalizedUrl: "http://127.0.0.1:7897",
      errorCode: null,
    });

    expect(validateGlobalProxySettings({
      [GLOBAL_PROXY_ENABLED_CONFIG_KEY]: true,
      [GLOBAL_PROXY_URL_CONFIG_KEY]: "socks5://127.0.0.1:1080",
    })).toEqual({
      enabled: true,
      normalizedUrl: "socks5://127.0.0.1:1080",
      errorCode: null,
    });
  });

  it("rejects missing, malformed, or unsupported proxy URLs", () => {
    expect(validateGlobalProxySettings({
      [GLOBAL_PROXY_ENABLED_CONFIG_KEY]: true,
      [GLOBAL_PROXY_URL_CONFIG_KEY]: "",
    }).errorCode).toBe("missing_url");

    expect(validateGlobalProxySettings({
      [GLOBAL_PROXY_ENABLED_CONFIG_KEY]: true,
      [GLOBAL_PROXY_URL_CONFIG_KEY]: "127.0.0.1:7897",
    }).errorCode).toBe("invalid_url");

    expect(validateGlobalProxySettings({
      [GLOBAL_PROXY_ENABLED_CONFIG_KEY]: true,
      [GLOBAL_PROXY_URL_CONFIG_KEY]: "ftp://127.0.0.1:7897",
    }).errorCode).toBe("unsupported_protocol");
  });

  it("rejects auth and path fragments in proxy URLs", () => {
    expect(validateGlobalProxySettings({
      [GLOBAL_PROXY_ENABLED_CONFIG_KEY]: true,
      [GLOBAL_PROXY_URL_CONFIG_KEY]: "http://user:pass@127.0.0.1:7897",
    }).errorCode).toBe("auth_unsupported");

    expect(validateGlobalProxySettings({
      [GLOBAL_PROXY_ENABLED_CONFIG_KEY]: true,
      [GLOBAL_PROXY_URL_CONFIG_KEY]: "http://127.0.0.1:7897/proxy",
    }).errorCode).toBe("path_unsupported");
  });

  it("describes validation errors with stable messages", () => {
    expect(describeGlobalProxyValidationError("missing_url")).toContain("required");
    expect(describeGlobalProxyValidationError("unsupported_protocol")).toContain("http");
  });
});
