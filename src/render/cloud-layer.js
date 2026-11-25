// Heights in world metres above sea level. One shared slab drives the sky,
// opaque depth composite, rain cutoff and the shadow on high terrain.
export const CLEAR_CLOUD_BASE=112;
export const CLOUD_THICKNESS=66;
export function cloudBase(overcast){return CLEAR_CLOUD_BASE-34*overcast;}

// Concentrate depth readback around the rider inside the volume, especially
// when a nearly horizontal ray travels kilometres before leaving the cloud.
export const CLOUD_SLICES_GLSL = `
vec4 cloudSlices(float span,float nearEdge) {
  vec4 regular=vec4(.25,.50,.75,1.);
  vec4 closeCuts=min(regular,vec4(8.,32.,125.,span)/max(.001,span));
  return mix(regular,closeCuts,1.-smoothstep(0.,12.,nearEdge));
}`;

// The cloud layer is traced at a fraction of the screen (render/skydome.js renderLow) with a per-pixel offset along
// each ray. Read back with one bilinear tap, that offset upscales into a coarse checkerboard over the clouds. Four
// bilinear taps half a low-resolution texel off the centre make a 3x3 [1 2 1] tent, which cancels the finest
// (texel-to-texel) pattern, at the cost of three extra reads.
export const CLOUD_RESOLVE_GLSL = `
vec4 cloudResolve(sampler2D t,vec2 uv) {
  vec2 o=.5/vec2(textureSize(t,0));
  return .25*(texture2D(t,uv+o)+texture2D(t,uv-o)+texture2D(t,uv+vec2(o.x,-o.y))+texture2D(t,uv+vec2(-o.x,o.y)));
}`;
