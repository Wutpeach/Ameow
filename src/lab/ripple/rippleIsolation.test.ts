import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { releaseAllocatedResources } from "./rippleResourceCleanup";
import { uploadFixture } from "./rippleTextureUpload";

const read = (path: string): string => readFileSync(resolve(import.meta.dirname, path), "utf8");

describe("Ripple Lab isolation", () => {
  const entry = read("../lab-main.tsx");
  const shell = read("../PresentationLab.tsx");
  const vite = read("../../../vite.config.ts");
  const canvas = read("./RippleCanvas.tsx");
  const rippleLab = read("./RippleLab.tsx");

  it("uses the ordinary Lab route and retains only the theme query", () => {
    expect(entry).toContain("PresentationLab");
    expect(entry).toContain('get("theme")');
    expect(entry).not.toContain('get("ripple")');
    expect(shell).toContain('<RippleLab reducedMotion={previewReducedMotion} />');
    expect(shell).toContain('matchMedia("(prefers-reduced-motion: reduce)")');
    const build = vite.slice(vite.indexOf("build: {"), vite.indexOf("test: {"));
    expect(build).toContain("index.html");
    expect(build).not.toContain("ripple");
  });

  it("mounts Ripple instead of the WebGL2 stage and omits its export action", () => {
    expect(shell).toContain('fullLane === "ripple" ? <RippleLab');
    expect(shell).toContain('fullLane !== "ripple"');
    expect(canvas).toContain("PANEL_SIZE = 200");
    expect(canvas).toContain('getContext("webgl"');
    expect(canvas).toContain("webglcontextlost");
    expect(canvas).toContain("webglcontextrestored");
    expect(canvas).not.toContain("ExpandedPresentationSurface");
    expect(canvas).not.toContain("GSAP");
    expect(canvas).toContain("textures.b = textures.a");
    expect(canvas).not.toContain("createFixture");
    expect(canvas).not.toContain("singleScene");
  });

  it("publishes transition labels before synchronous Reduced Motion settlement", () => {
    expect(rippleLab).toContain('setSettlement("forward"); controllerRef.current?.start(origin);');
    expect(rippleLab).toContain('setSettlement("reverse"); controllerRef.current?.reverse();');
    expect(rippleLab.indexOf('setSettlement("replacement")')).toBeLessThan(rippleLab.indexOf("controllerRef.current?.replace(clamped)"));
  });

  it("releases every successfully allocated resource after a partial initialization failure", () => {
    const released: string[] = [];
    const vertex = {} as WebGLShader;
    const fragment = {} as WebGLShader;
    const textureA = {} as WebGLTexture;
    releaseAllocatedResources({
      deleteTexture: (value) => released.push(`texture:${value === textureA ? "a" : "b"}`),
      deleteBuffer: () => released.push("buffer"),
      deleteProgram: () => released.push("program"),
      deleteShader: (value) => released.push(`shader:${value === vertex ? "vertex" : "fragment"}`),
    }, { vertex, fragment, program: {} as WebGLProgram, buffer: {} as WebGLBuffer, textures: { a: textureA } });
    expect(released).toEqual(["texture:a", "buffer", "program", "shader:vertex", "shader:fragment"]);
  });

  it("deletes a shared single-scene texture identity once and releases upload failure", () => {
    const texture = {} as WebGLTexture;
    const deleted: WebGLTexture[] = [];
    releaseAllocatedResources({ deleteTexture: (value) => { if (value !== null) deleted.push(value); }, deleteBuffer: () => undefined, deleteProgram: () => undefined, deleteShader: () => undefined }, { vertex: null, fragment: null, program: null, buffer: null, textures: { a: texture, b: texture } });
    expect(deleted).toEqual([texture]);
    const released: WebGLTexture[] = [];
    const gl = { createTexture: () => texture, activeTexture: () => undefined, bindTexture: () => undefined, pixelStorei: () => undefined, texImage2D: () => { throw new Error("upload failure"); }, texParameteri: () => undefined, deleteTexture: (value: WebGLTexture | null) => { if (value !== null) released.push(value); }, TEXTURE0: 0, TEXTURE_2D: 1, UNPACK_FLIP_Y_WEBGL: 2, RGBA: 3, UNSIGNED_BYTE: 4, TEXTURE_MIN_FILTER: 5, LINEAR: 6, TEXTURE_MAG_FILTER: 7, TEXTURE_WRAP_S: 8, CLAMP_TO_EDGE: 9, TEXTURE_WRAP_T: 10 } as unknown as WebGLRenderingContext;
    expect(() => uploadFixture(gl, 0, {} as HTMLCanvasElement)).toThrow("upload failure");
    expect(released).toEqual([texture]);
  });
});
