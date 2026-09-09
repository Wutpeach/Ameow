export type AllocatedRippleResources = Readonly<{
  vertex: WebGLShader | null;
  fragment: WebGLShader | null;
  program: WebGLProgram | null;
  buffer: WebGLBuffer | null;
  textures: Readonly<{ a?: WebGLTexture; b?: WebGLTexture }>;
}>;

/** Candidate-local cleanup for both complete and partially initialized WebGL1 resources. */
export const releaseAllocatedResources = (
  gl: Pick<WebGLRenderingContext, "deleteTexture" | "deleteBuffer" | "deleteProgram" | "deleteShader">,
  resources: AllocatedRippleResources,
) => {
  const textures = new Set<WebGLTexture>();
  if (resources.textures.a !== undefined) textures.add(resources.textures.a);
  if (resources.textures.b !== undefined) textures.add(resources.textures.b);
  textures.forEach((texture) => gl.deleteTexture(texture));
  if (resources.buffer !== null) gl.deleteBuffer(resources.buffer);
  if (resources.program !== null) gl.deleteProgram(resources.program);
  if (resources.vertex !== null) gl.deleteShader(resources.vertex);
  if (resources.fragment !== null) gl.deleteShader(resources.fragment);
};
