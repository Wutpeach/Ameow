import { describe, expect, it } from "vitest";

import {
  errorDiagnosticCategoryTranslationKey,
  resolveErrorDiagnosticCategory,
} from "./errorDiagnosticCategories";

describe("errorDiagnosticCategories", () => {
  it("maps auth failures to the login-state category", () => {
    expect(resolveErrorDiagnosticCategory({
      surface: "download",
      failure: {
        code: "E_AUTH_REQUIRED",
        classification: "auth_required",
        rawMessage: "Fresh cookies are required",
      },
    })).toBe("auth_login_state");
  });

  it("maps network and proxy-like failures before generic content failures", () => {
    expect(resolveErrorDiagnosticCategory({
      surface: "download",
      failure: {
        rawMessage: "ERROR: HTTP Error 429: Too Many Requests via proxy",
      },
    })).toBe("network_proxy");
  });

  it("maps unavailable formats to the selected-quality category", () => {
    expect(resolveErrorDiagnosticCategory({
      surface: "download",
      failure: {
        rawMessage: "Requested format is not available",
      },
    })).toBe("quality_format_unavailable");
  });

  it("defaults transcode failures to the transcode category", () => {
    expect(resolveErrorDiagnosticCategory({
      surface: "transcode",
      failure: {
        rawMessage: "ffmpeg exited with code 1",
      },
    })).toBe("transcode_merge");
  });

  it("returns stable desktop translation keys", () => {
    expect(errorDiagnosticCategoryTranslationKey("output_write"))
      .toBe("app.errorDiagnostic.category.output_write");
  });
});
