// A sun-aligned optical-depth survey at the base of the cloud layer. Sky, terrain,
// water and the air between camera and scene all share the same moving shadows.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CLOUD_THICKNESS } from './cloud-layer.js';
import { CLOUD_DENSITY_GLSL } from './cloudVolume.js';

export const cloudSunMap = {
  texture: { value: null },
  box: { value: new THREE.Vector4(0, 0, 1, 0) }
};
const vertexShader = 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
const slab = CLOUD_THICKNESS.toFixed(1);
export const CLOUD_SUN_LOOKUP_GLSL = /* glsl */ `
uniform sampler2D mvCloudSunMap;
uniform vec4 mvCloudSunBox;
vec2 mvSunFoot(vec3 p, vec3 sun, float base) {
  return (p.xz+sun.xz*((base-p.y)/max(.055,sun.y))-mvCloudSunBox.xy)*mvCloudSunBox.z;
}
float mvSunEdge(vec2 uv) {
  vec2 edge=min(uv,1.-uv);
  return smoothstep(.0,.05,min(edge.x,edge.y))*mvCloudSunBox.w;
}
// The second channel covers the camera neighbourhood at four times the
// linear resolution, so narrow sun gaps survive the continental survey.
vec2 mvSunColumn(vec2 uv) {
  vec2 nearUV=(uv-.5)*4.+.5;
  vec2 border=min(nearUV,1.-nearUV);
  float blend=smoothstep(.015,.12,min(border.x,border.y));
  if(blend<=.001) return textureLod(mvCloudSunMap,uv,0.).rb;
  vec2 nearLight=textureLod(mvCloudSunMap,nearUV,0.).ga;
  if(blend>=.999) return nearLight;
  return mix(textureLod(mvCloudSunMap,uv,0.).rb,nearLight,blend);
}
float mvCloudSunAt(vec3 p, vec3 sun, float base) {
  if(p.y>=base+${slab} || mvCloudSunBox.w<.5) return 1.;
  vec2 uv=mvSunFoot(p,sun,base);
  float within=1.-smoothstep(base,base+${slab},p.y);
  // a firmer edge than the raw optical depth: drifting cloud shadows read as shapes on the land, not a dimmer day
  float tr=smoothstep(.12,.82,mvSunColumn(uv).r);
  return mix(1.,tr,mvSunEdge(uv)*within);
}`;

const COLUMN_FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform float uCloudH;
uniform vec3 mvSunDir;
uniform vec4 mvCloudSunBox;
uniform vec2 uCellMetres;
varying vec2 vUv;
${CLOUD_DENSITY_GLSL}
float surveyColumn(vec2 xz) {
  vec3 p=vec3(xz.x,uCloudH,xz.y);
  float segment=${slab}/(max(.055,mvSunDir.y)*float(COLUMN_STEPS));
  float depth=0.;
  for(int i=0;i<COLUMN_STEPS;i++){
    depth+=densityAt(p+mvSunDir*((float(i)+.5)*segment))*segment;
  }
  return exp(-min(12.,depth*.079));
}
void main() {
  vec2 centre=mvCloudSunBox.xy+.5/mvCloudSunBox.z;
  vec2 offset=(vUv-.5)/mvCloudSunBox.z;
  vec2 tr=vec2(surveyColumn(centre+offset),surveyColumn(centre+offset*.25));
  // Vapour bordering a clear opening scatters more strongly than the dry air
  // in its centre. Derivatives of the measured optical depth locate that edge
  // at both survey scales, in world metres, just once per cloud update.
  vec2 dx=dFdx(tr)/uCellMetres,dy=dFdy(tr)/uCellMetres;
  vec2 rim=smoothstep(vec2(.010),vec2(.048),sqrt(dx*dx+dy*dy));
  gl_FragColor=vec4(tr,rim);
}`;

const BEAM_FRAG = /* glsl */ `
uniform sampler2D tDepth;
uniform mat4 uInvProj,uCamera;
uniform float uCloudH;
uniform vec3 mvSunDir;
varying vec2 vUv;
${CLOUD_SUN_LOOKUP_GLSL}
uniform highp sampler2DShadow tLocalShadow;
uniform mat4 uLocalLight;
uniform float uShadowReady;
vec2 nearbyOcclusion(vec3 p) {
  if(uShadowReady<.5) return vec2(1.,0.);
  vec4 clip=uLocalLight*vec4(p,1.);
  vec3 q=clip.xyz/clip.w;
  vec2 edge=min(q.xy,1.-q.xy);
  float inside=smoothstep(0.,.075,min(edge.x,edge.y));
  if(inside<=0. || q.z<=0. || q.z>=1.) return vec2(1.,0.);
  q.z-=.00028;
  float vis=texture(tLocalShadow,q);
  if(vis<.02) return vec2(1.-inside,0.);
  // A leaf or an arch casts a narrow shadow through a sunlit cloud window.
  // Only a locally broken silhouette contributes this fine secondary shaft.
  float around=texture(tLocalShadow,q+vec3(.057,.021,0.))
              +texture(tLocalShadow,q-vec3(.057,.021,0.))
              +texture(tLocalShadow,q+vec3(-.029,.049,0.))
              +texture(tLocalShadow,q-vec3(-.029,.049,0.));
  return vec2(mix(1.,vis,inside),vis*inside*(1.-around*.25));
}
void main() {
  float d=texture2D(tDepth,vUv).r;
  vec4 h=uInvProj*vec4(vUv*2.-1.,d*2.-1.,1.);
  vec3 eye=uCamera[3].xyz, hit=mat3(uCamera)*(h.xyz/h.w);
  float depth=length(hit), reach=min(depth,820.);
  vec3 ray=hit/max(.0001,depth);
  // Only the humid lower air scatters strongly. Stop at the nearest opaque
  // surface or cloud base, and integrate within the remaining physical segment.
  float ceiling=uCloudH+2.5, start=0.;
  if(ray.y>.0001) reach=clamp((ceiling-eye.y)/ray.y,0.,reach);
  if(ray.y<-.0001) start=max(0.,(ceiling-eye.y)/ray.y);
  float span=max(0.,reach-start);
  float energy=0.;
  if(span>.01) {
    float jitter=.72*(fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5);
    for(int i=0;i<BEAM_STEPS;i++) {
      float a=float(i)/float(BEAM_STEPS),b=(float(i)+1.)/float(BEAM_STEPS);
      a=mix(a,a*a,.79);b=mix(b,b*b,.79);
      float t=start+mix(a,b,.5+jitter)*span, stepSize=(b-a)*span;
      vec3 p=eye+ray*t;
      vec2 uv=mvSunFoot(p,mvSunDir,uCloudH);
      vec2 field=mvSunColumn(uv);
      float light=field.r;
      // Adjacent shaded air makes a clear column visible. In uniformly clear
      // weather there is no extra veil. Two footprint scales resolve narrow
      // crepuscular rays and the broad fans below broken cloud.
      float surround=textureLod(mvCloudSunMap,uv,3.1).r*.36
                    +textureLod(mvCloudSunMap,uv,4.8).r*.64;
      float contrast=max(0.,light-surround);
      float broad=.17*smoothstep(.08,.72,contrast)*contrast;
      float windows=light*(broad+1.50*field.g)*smoothstep(.035,.52,light);
      vec2 local=t<75.?nearbyOcclusion(p):vec2(1.,0.);
      float fog=exp(-t*.0048)*smoothstep(.45,7.,t);
      energy+=(windows*local.x+light*local.y*2.7)*fog*stepSize*mvSunEdge(uv);
    }
  }
  float phase=.14+.86*pow(max(dot(ray,mvSunDir),0.),2.4);
  gl_FragColor=vec4(min(.85,energy*.014*phase),min(depth,820.),0.,1.);
}`;

// The march above runs at a fraction of the screen with a per-texel offset along the ray (interleaved gradient noise).
// Upscaled as it is, that offset reads as a coarse checkerboard over sunlit land and sky, so the low-resolution result
// is resolved first: a separable depth-aware binomial blur (7 taps per axis), run horizontally then vertically at the
// low resolution. Weights fall off with depth difference, so a shaft never bleeds across a silhouette.
const RESOLVE_FRAG = /* glsl */ `
uniform sampler2D tBeam;
uniform ivec2 uAxis;
varying vec2 vUv;
void main() {
  ivec2 last=textureSize(tBeam,0)-1, p=clamp(ivec2(vUv*vec2(last+1)),ivec2(0),last);
  vec2 c=texelFetch(tBeam,p,0).rg;
  float tol=max(2.,.055*c.g), sum=c.r*20., weight=20.;
  for(int i=1;i<=3;i++){
    float k=i==1?15.:i==2?6.:1.;
    for(int s=-1;s<=1;s+=2){
      vec2 q=texelFetch(tBeam,clamp(p+uAxis*(i*s),ivec2(0),last),0).rg;
      float d=(q.g-c.g)/tol, w=k/(1.+d*d);
      sum+=q.r*w; weight+=w;
    }
  }
  gl_FragColor=vec4(sum/weight,c.g,0.,1.);
}`;

// Four depth-weighted low-resolution samples preserve fine branches, reins and
// faces in front of a shaft. Each pixel's scattering vanishes at the near plane.
export const BEAM_UPSAMPLE_GLSL = /* glsl */ `
float mvBeamGather(sampler2D tex,vec2 uv,float depth) {
  vec2 dims=vec2(textureSize(tex,0)), coord=uv*dims-.5, f=fract(coord);
  ivec2 base=ivec2(floor(coord)), last=ivec2(dims)-1;
  float sum=0.,weight=0.;
  for(int i=0;i<4;i++){
    ivec2 o=ivec2(i%2,i/2);
    vec2 w=mix(1.-f,f,vec2(o));
    vec2 sampleValue=texelFetch(tex,clamp(base+o,ivec2(0),last),0).rg;
    float delta=abs(sampleValue.g-depth)/max(2.,.055*depth);
    float k=max(.0001,1./(1.+delta*delta))*w.x*w.y;
    sum+=sampleValue.r*k*min(1.,depth/max(1.,sampleValue.g));
    weight+=k;
  }
  return sum/max(.000001,weight)*smoothstep(1.,10.,depth);
}`;

function material(fragmentShader, uniforms, defines) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    defines,
    depthWrite: false,
    depthTest: false,
    toneMapped: false
  });
}

export function createCloudShafts(camera, depth, dome, quality, sunShadow) {
  const low = quality === 'low',
    high = quality === 'high';
  const size = low ? 192 : high ? 384 : 288,
    span = low ? 3840 : 5120;
  const column = new THREE.WebGLRenderTarget(size, size, {
    depthBuffer: false,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter
  });
  column.texture.name = 'Solar transmittance through the cloud layer';
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  target.texture.name = 'Depth-limited atmospheric light shafts';
  const across = target.clone();
  across.texture.name = 'Light shafts, resolved across';
  const shared = { ...dome, mvCloudSunMap: cloudSunMap.texture, mvCloudSunBox: cloudSunMap.box };
  const survey = material(
    COLUMN_FRAG,
    { ...shared, uCellMetres: { value: new THREE.Vector2(span / size, span / (4 * size)) } },
    { COLUMN_STEPS: low ? 5 : high ? 9 : 7 }
  );
  const beam = material(
    BEAM_FRAG,
    {
      ...shared,
      tDepth: { value: depth },
      tLocalShadow: { value: null },
      uLocalLight: { value: sunShadow.matrix },
      uShadowReady: { value: 0 },
      uInvProj: { value: camera.projectionMatrixInverse },
      uCamera: { value: camera.matrixWorld }
    },
    { BEAM_STEPS: low ? 15 : high ? 29 : 21 }
  );
  const resolveX = material(RESOLVE_FRAG, { tBeam: { value: target.texture }, uAxis: { value: new THREE.Vector2(1, 0) } });
  const resolveY = material(RESOLVE_FRAG, { tBeam: { value: across.texture }, uAxis: { value: new THREE.Vector2(0, 1) } });
  const quad = new FullScreenQuad(null);
  let lastTime = -Infinity,
    lastCover = NaN,
    lastSunY = NaN,
    lastWind = NaN;
  return {
    column,
    target,
    box: cloudSunMap.box.value,
    updateMap(renderer) {
      const sun = dome.mvSunDir.value,
        base = dome.uCloudH.value,
        cam = camera.position;
      const box = cloudSunMap.box.value;
      if (sun.y < 0.025) {
        box.w = 0;
        return;
      }
      const offset = Math.max(0, base - cam.y) / Math.max(0.055, sun.y);
      const snap = (span / size) * 4;
      const x = Math.round((cam.x + sun.x * offset) / snap) * snap - span * 0.5;
      const z = Math.round((cam.z + sun.z * offset) / snap) * snap - span * 0.5;
      const time = dome.mvTime.value,
        cover = dome.uCloudCover.value;
      if (
        box.w &&
        box.x === x &&
        box.y === z &&
        Math.abs(time - lastTime) < 0.18 &&
        Math.abs(cover - lastCover) < 0.009 &&
        Math.abs(sun.y - lastSunY) < 0.003 &&
        Math.abs(dome.mvCloudFlow.value.x - lastWind) < 4
      )
        return;
      box.set(x, z, 1 / span, 1);
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(column);
      quad.material = survey;
      quad.render(renderer);
      renderer.setRenderTarget(previous);
      cloudSunMap.texture.value = column.texture;
      lastTime = time;
      lastCover = cover;
      lastSunY = sun.y;
      lastWind = dome.mvCloudFlow.value.x;
    },
    draw(renderer) {
      beam.uniforms.tLocalShadow.value = sunShadow.map?.depthTexture ?? null;
      beam.uniforms.uShadowReady.value = beam.uniforms.tLocalShadow.value ? 1 : 0;
      renderer.setRenderTarget(target);
      quad.material = beam;
      quad.render(renderer);
      renderer.setRenderTarget(across);
      quad.material = resolveX;
      quad.render(renderer);
      renderer.setRenderTarget(target);
      quad.material = resolveY;
      quad.render(renderer);
    },
    setSize(w, h) {
      const divisor = low ? 8 : high ? 4 : 5;
      const tw = Math.max(1, Math.round(w / divisor)), th = Math.max(1, Math.round(h / divisor));
      target.setSize(tw, th);
      across.setSize(tw, th);
    },
    dispose() {
      if (cloudSunMap.texture.value === column.texture) {
        cloudSunMap.texture.value = null;
        cloudSunMap.box.value.w = 0;
      }
      column.dispose();
      target.dispose();
      across.dispose();
      survey.dispose();
      beam.dispose();
      resolveX.dispose();
      resolveY.dispose();
      quad.dispose();
    }
  };
}
