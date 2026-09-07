/**
 * What sand looks like, without a single texture.
 *
 * Built on MeshStandardMaterial rather than a bare ShaderMaterial so lighting,
 * shadows, fog and tone mapping all keep working - only the surface colour and
 * roughness are replaced. No texture also means no texture memory, which is
 * the constraint that actually bites once props arrive.
 *
 * The band that sells it is the wet sand just above the waterline: darker,
 * and much smoother so it catches a highlight. That reads as a beach far more
 * than any amount of extra geometry does.
 *
 * Depends on chunk positions being world-space with the mesh at the origin, so
 * position.y in the vertex shader is the true height above sea level.
 */
import { Color, MeshStandardMaterial } from 'three'
import { TERRAIN } from './island'

const VERT_HEAD = `
varying float vGroundY;
varying vec3 vGroundNormal;
varying vec3 vGroundPos;
`

const VERT_BODY = `
vGroundY = position.y;
vGroundNormal = normal;
vGroundPos = position;
`

const FRAG_HEAD = `
varying float vGroundY;
varying vec3 vGroundNormal;
varying vec3 vGroundPos;

// Cheap value noise, just to break up flat gradients so large slopes do not
// read as a single sheet of plastic.
float sandHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float sandNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = sandHash(i);
  float b = sandHash(i + vec2(1.0, 0.0));
  float c = sandHash(i + vec2(0.0, 1.0));
  float d = sandHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`

/** Replaces the diffuse colour and roughness with the sand blend. */
function fragBody(maxHeight: number, beachWidth: number): string {
  return `
float gy = vGroundY;
float steep = 1.0 - clamp(vGroundNormal.y, 0.0, 1.0);

vec3 wetSand  = vec3(0.352, 0.290, 0.216);
vec3 drySand  = vec3(0.812, 0.729, 0.560);
vec3 paleSand = vec3(0.878, 0.816, 0.663);
vec3 duneSand = vec3(0.760, 0.647, 0.463);
vec3 exposed  = vec3(0.435, 0.396, 0.337);

// Damp band hugging the waterline, drying out as the ground rises.
float wet = 1.0 - smoothstep(0.0, ${beachWidth.toFixed(1)} * 0.85, gy);
// Below the waterline it is all wet.
wet = max(wet, 1.0 - smoothstep(-3.0, 0.0, gy));

float high = smoothstep(${maxHeight.toFixed(1)} * 0.30, ${maxHeight.toFixed(1)} * 0.78, gy);

float grain = sandNoise(vGroundPos.xz * 1.7) * 0.5 + sandNoise(vGroundPos.xz * 7.3) * 0.5;

vec3 sand = mix(drySand, paleSand, grain * 0.55);
sand = mix(sand, duneSand, high * 0.65);
sand = mix(sand, wetSand, wet);
// Anything genuinely steep has lost its sand.
sand = mix(sand, exposed, smoothstep(0.42, 0.72, steep));

diffuseColor.rgb = sand;
`
}

/** Wet sand is smooth and catches the sun; dry sand does not. */
const ROUGH_BODY = `
float wetR = 1.0 - smoothstep(0.0, 5.0, vGroundY);
wetR = max(wetR, 1.0 - smoothstep(-3.0, 0.0, vGroundY));
roughnessFactor = mix(0.94, 0.34, wetR);
`

export function createSandMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: new Color('#d0bd90'),
    roughness: 0.95,
    metalness: 0.0,
    flatShading: false,
  })

  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${VERT_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>${VERT_BODY}`)

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${FRAG_HEAD}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>${fragBody(TERRAIN.maxHeight, TERRAIN.beachWidth)}`,
      )
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>${ROUGH_BODY}`)
  }

  // Materials with the same key share a compiled program; give this one its own.
  material.customProgramCacheKey = () => 'localrot-sand-v1'
  return material
}
