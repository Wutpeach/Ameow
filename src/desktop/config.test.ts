import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("./runtime", () => ({
  desktopCommands: {
    invoke: invokeMock,
  },
}));

import {
  loadConfigObject,
  parseConfigObject,
  patchConfigObject,
  saveConfigPatch,
} from "./config";

describe("parseConfigObject", () => {
  it("returns an empty object for invalid or non-object config strings", () => {
    expect(parseConfigObject("{")).toEqual({});
    expect(parseConfigObject("")).toEqual({});
    expect(parseConfigObject("[]")).toEqual({});
    expect(parseConfigObject("null")).toEqual({});
    expect(parseConfigObject("true")).toEqual({});
    expect(parseConfigObject("42")).toEqual({});
  });

  it("returns the parsed object for valid config JSON objects", () => {
    expect(parseConfigObject(JSON.stringify({ outputPath: "D:/Ameow" }))).toEqual({
      outputPath: "D:/Ameow",
    });
  });
});

describe("loadConfigObject", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("loads and parses the raw config string", async () => {
    invokeMock.mockResolvedValueOnce(JSON.stringify({ theme: "white" }));

    await expect(loadConfigObject()).resolves.toEqual({ theme: "white" });

    expect(invokeMock).toHaveBeenCalledOnce();
    expect(invokeMock).toHaveBeenCalledWith("get_config");
  });

  it("falls back to an empty object for an empty config string", async () => {
    invokeMock.mockResolvedValueOnce("");

    await expect(loadConfigObject()).resolves.toEqual({});
  });
});

describe("patchConfigObject", () => {
  it("applies an object patch without removing unrelated fields", () => {
    expect(patchConfigObject(
      { outputPath: "D:/Ameow", aePortalEnabled: false },
      { aePortalEnabled: true },
    )).toEqual({
      outputPath: "D:/Ameow",
      aePortalEnabled: true,
    });
  });

  it("applies a mutating patch to a copied config object", () => {
    const original = { outputPath: "D:/Ameow", extensionInjectionDebugEnabled: false };

    const next = patchConfigObject(original, (draft) => {
      draft.extensionInjectionDebugEnabled = true;
    });

    expect(next).toEqual({
      outputPath: "D:/Ameow",
      extensionInjectionDebugEnabled: true,
    });
    expect(original).toEqual({
      outputPath: "D:/Ameow",
      extensionInjectionDebugEnabled: false,
    });
  });
});

describe("saveConfigPatch", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("loads, patches, and saves the full config string", async () => {
    invokeMock
      .mockResolvedValueOnce(JSON.stringify({ outputPath: "D:/Ameow" }))
      .mockResolvedValueOnce(undefined);

    await expect(saveConfigPatch({ aePortalEnabled: true })).resolves.toEqual({
      outputPath: "D:/Ameow",
      aePortalEnabled: true,
    });

    expect(invokeMock).toHaveBeenNthCalledWith(1, "get_config");
    expect(invokeMock).toHaveBeenNthCalledWith(2, "save_config", {
      json: JSON.stringify({
        outputPath: "D:/Ameow",
        aePortalEnabled: true,
      }),
    });
  });

  it("patches an empty object when the stored config JSON is invalid", async () => {
    invokeMock
      .mockResolvedValueOnce("{")
      .mockResolvedValueOnce(undefined);

    await expect(saveConfigPatch({ aePortalEnabled: true })).resolves.toEqual({
      aePortalEnabled: true,
    });

    expect(invokeMock).toHaveBeenNthCalledWith(2, "save_config", {
      json: JSON.stringify({ aePortalEnabled: true }),
    });
  });

  it("propagates get_config failures without saving", async () => {
    const error = new Error("config unavailable");
    invokeMock.mockRejectedValueOnce(error);

    await expect(saveConfigPatch({ aePortalEnabled: true })).rejects.toThrow(error);

    expect(invokeMock).toHaveBeenCalledOnce();
    expect(invokeMock).toHaveBeenCalledWith("get_config");
  });

  it("propagates save_config failures", async () => {
    const error = new Error("save failed");
    invokeMock
      .mockResolvedValueOnce(JSON.stringify({ outputPath: "D:/Ameow" }))
      .mockRejectedValueOnce(error);

    await expect(saveConfigPatch({ aePortalEnabled: true })).rejects.toThrow(error);

    expect(invokeMock).toHaveBeenNthCalledWith(2, "save_config", {
      json: JSON.stringify({
        outputPath: "D:/Ameow",
        aePortalEnabled: true,
      }),
    });
  });
});
