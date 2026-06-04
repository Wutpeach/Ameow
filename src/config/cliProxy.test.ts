import { describe, expect, it } from "vitest";

import {
  resolveCliProxyUrlFromElectronProxyRules,
  resolveCliProxyUrlFromEnvironment,
} from "./cliProxy";

describe("CLI proxy resolution", () => {
  it("extracts HTTP proxies from Electron proxy resolution rules", () => {
    expect(resolveCliProxyUrlFromElectronProxyRules("PROXY 127.0.0.1:7897; DIRECT"))
      .toBe("http://127.0.0.1:7897");
    expect(resolveCliProxyUrlFromElectronProxyRules("HTTPS 127.0.0.1:7898"))
      .toBe("https://127.0.0.1:7898");
    expect(resolveCliProxyUrlFromElectronProxyRules("SOCKS5 127.0.0.1:7891; DIRECT"))
      .toBeNull();
    expect(resolveCliProxyUrlFromElectronProxyRules("DIRECT")).toBeNull();
  });

  it("rejects malformed or non-proxy Electron rules", () => {
    expect(resolveCliProxyUrlFromElectronProxyRules("PROXY")).toBeNull();
    expect(resolveCliProxyUrlFromElectronProxyRules("PROXY http://user:pass@127.0.0.1:7897")).toBeNull();
    expect(resolveCliProxyUrlFromElectronProxyRules("PROXY 127.0.0.1:7897/path")).toBeNull();
  });

  it("extracts HTTP proxies from environment variables", () => {
    expect(resolveCliProxyUrlFromEnvironment({
      HTTPS_PROXY: "http://127.0.0.1:7897",
    })).toBe("http://127.0.0.1:7897");
    expect(resolveCliProxyUrlFromEnvironment({
      HTTPS_PROXY: "socks5://127.0.0.1:7891",
      HTTP_PROXY: "http://127.0.0.1:7890",
    })).toBe("http://127.0.0.1:7890");
  });

  it("ignores malformed or unsupported environment proxy values", () => {
    expect(resolveCliProxyUrlFromEnvironment({
      HTTPS_PROXY: "127.0.0.1:7897",
      HTTP_PROXY: "ftp://127.0.0.1:7890",
      ALL_PROXY: "http://user:pass@127.0.0.1:7891",
    })).toBeNull();
  });
});
