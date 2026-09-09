import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  RIPPLE_FRAGMENT_SOURCE,
  RIPPLE_USER_BASELINE,
  RIPPLE_VERTEX_SOURCE,
  power3Out,
  sourcePinchAt,
} from "./rippleSource";
import type { RippleFrame } from "./rippleController";
import { releaseAllocatedResources } from "./rippleResourceCleanup";
import { uploadFixture } from "./rippleTextureUpload";
import ameowSceneFixtureUrl from "./ameow-download-active-200.png";

type ProgramResources = Readonly<{
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  vertex: WebGLShader;
  fragment: WebGLShader;
  buffer: WebGLBuffer;
  textures: Readonly<{ a: WebGLTexture; b: WebGLTexture }>;
  uniforms: Readonly<Record<string, WebGLUniformLocation | null>>;
}>;

export type RippleCanvasHandle = Readonly<{
  renderFrame: (frame: RippleFrame) => void;
}>;

const PANEL_SIZE = 200;
const MAX_DPR = 2;

const compile = (gl: WebGLRenderingContext, type: number, source: string): WebGLShader => {
  const shader = gl.createShader(type);
  if (shader === null) throw new Error("WebGL shader allocation failed");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "shader compile error";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
};

const destroy = (resources: ProgramResources | null) => {
  if (resources !== null) releaseAllocatedResources(resources.gl, resources);
};

/** WebGL1 pixel leaf. It has no pointer, clock, completion, or semantic state. */
type RippleCanvasProps = Readonly<{
  onStatusChange?: (status: "ready" | "recovering" | "unavailable") => void;
}>;

const loadSceneFixture = (): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error("Ameow Lab fixture failed to load"));
  image.src = ameowSceneFixtureUrl;
});

export const RippleCanvas = forwardRef<RippleCanvasHandle, RippleCanvasProps>(function RippleCanvas({
  onStatusChange,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const resourcesRef = useRef<ProgramResources | null>(null);
  const latestFrameRef = useRef<RippleFrame | null>(null);
  const disposedRef = useRef(false);

  const draw = (frame: RippleFrame) => {
    latestFrameRef.current = frame;
    const resources = resourcesRef.current;
    const canvas = canvasRef.current;
    if (resources === null || canvas === null || disposedRef.current) return;
    const { gl, program, textures, uniforms } = resources;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const width = Math.round(PANEL_SIZE * dpr);
    const height = Math.round(PANEL_SIZE * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textures.a);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textures.b);
    gl.uniform2f(uniforms.u_resolution, width, height);
    gl.uniform2f(uniforms.u_center, frame.origin.x, frame.origin.y);
    gl.uniform1f(uniforms.u_progress, power3Out(frame.rawPhase));
    gl.uniform1f(uniforms.u_sigma, RIPPLE_USER_BASELINE.sigma);
    gl.uniform1f(uniforms.u_waveFreq, RIPPLE_USER_BASELINE.waveFreq);
    gl.uniform1f(uniforms.u_pushAmt, RIPPLE_USER_BASELINE.pushAmt);
    gl.uniform1f(uniforms.u_caStrength, RIPPLE_USER_BASELINE.caStrength);
    gl.uniform1f(uniforms.u_glow, RIPPLE_USER_BASELINE.glow);
    gl.uniform1f(uniforms.u_noiseWarp, RIPPLE_USER_BASELINE.noiseWarp);
    gl.uniform1f(uniforms.u_swap, 0);
    gl.uniform1f(uniforms.u_pinch, sourcePinchAt(frame.rawPhase, frame.pinchEnabled));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  useImperativeHandle(ref, () => ({ renderFrame: draw }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    disposedRef.current = false;
    const initialize = async () => {
      let sceneFixture: HTMLImageElement | null = null;
      try {
        sceneFixture = await loadSceneFixture();
      } catch {
        onStatusChange?.("unavailable");
        return;
      }
      if (disposedRef.current) return;
      const gl = canvas.getContext("webgl", { premultipliedAlpha: false });
      if (gl === null) {
        onStatusChange?.("unavailable");
        return;
      }
      let vertex: WebGLShader | null = null;
      let fragment: WebGLShader | null = null;
      let program: WebGLProgram | null = null;
      let buffer: WebGLBuffer | null = null;
      const textures: { a?: WebGLTexture; b?: WebGLTexture } = {};
      try {
        vertex = compile(gl, gl.VERTEX_SHADER, RIPPLE_VERTEX_SOURCE);
        fragment = compile(gl, gl.FRAGMENT_SHADER, RIPPLE_FRAGMENT_SOURCE);
        program = gl.createProgram();
        buffer = gl.createBuffer();
        if (program === null || buffer === null || vertex === null || fragment === null) throw new Error("WebGL resource allocation failed");
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "program link error");
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, "a_pos");
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        textures.a = uploadFixture(gl, 0, sceneFixture);
        textures.b = textures.a;
        if (textures.a === undefined || textures.b === undefined) throw new Error("WebGL texture allocation failed");
        const activeProgram = program;
        gl.uniform1i(gl.getUniformLocation(activeProgram, "u_texA"), 0);
        gl.uniform1i(gl.getUniformLocation(activeProgram, "u_texB"), 1);
        resourcesRef.current = {
          gl, program, vertex, fragment, buffer, textures: { a: textures.a, b: textures.b },
          uniforms: Object.fromEntries([
            "u_resolution", "u_center", "u_progress", "u_sigma", "u_waveFreq", "u_pushAmt",
            "u_caStrength", "u_glow", "u_noiseWarp", "u_swap", "u_pinch",
          ].map((name) => [name, gl.getUniformLocation(activeProgram, name)])),
        };
        onStatusChange?.("ready");
        if (latestFrameRef.current !== null) draw(latestFrameRef.current);
      } catch {
        releaseAllocatedResources(gl, { vertex, fragment, program, buffer, textures });
        resourcesRef.current = null;
        onStatusChange?.("unavailable");
      }
    };
    const onLost = (event: Event) => {
      event.preventDefault();
      destroy(resourcesRef.current);
      resourcesRef.current = null;
      onStatusChange?.("recovering");
    };
    const onRestored = () => {
      onStatusChange?.("recovering");
      void initialize();
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      if (latestFrameRef.current !== null) draw(latestFrameRef.current);
    });
    observer?.observe(canvas);
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    void initialize();
    return () => {
      disposedRef.current = true;
      observer?.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      destroy(resourcesRef.current);
      resourcesRef.current = null;
    };
  }, [onStatusChange]);

  return <canvas ref={canvasRef} aria-hidden="true" style={{ display: "block", width: PANEL_SIZE, height: PANEL_SIZE }} />;
});
