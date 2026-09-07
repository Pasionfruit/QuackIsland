/**
 * The sky: gradient, sun, stars and cloud, in one draw call.
 *
 * All four are one shader on the inside of one sphere, because all four are
 * functions of the direction you are looking and nothing else. Clouds as
 * billboards would be hundreds of sorted transparent quads; clouds as a
 * projected plane inside the same shader are a few lines of noise.
 *
 * The dome is unlit and unfogged on purpose. It is not a thing in the world at
 * a distance - it *is* the distance, and fogging it would paint it out with
 * the very colour it is supposed to be providing.
 */
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry } from 'three'
import { PRIORITY, readSky, useGameFrame } from '../../00-core'
import { SKY } from './dome'

const vertexShader = /* glsl */ `
varying vec3 vDir;
void main() {
  // The direction from the middle of the dome, which is where the camera is.
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const fragmentShader = /* glsl */ `
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform vec3 uCloudColor;
uniform float uSunStrength;
uniform float uDaylight;
uniform float uCloud;
uniform float uCloudShade;
uniform float uTime;

varying vec3 vDir;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  // Smoothstep the cell, or the clouds come out as visible diamonds.
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

/** Four octaves is enough for cloud at this size and cheap enough to not care. */
float fbm(vec2 p) {
  float total = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    total += noise(p) * amplitude;
    p *= 2.03;
    amplitude *= 0.5;
  }
  return total;
}

void main() {
  vec3 dir = normalize(vDir);

  // The gradient. The power curve keeps the horizon band tight rather than
  // smearing sky colour halfway down.
  float up = clamp(dir.y, 0.0, 1.0);
  vec3 colour = mix(uHorizon, uZenith, pow(up, 0.55));

  // Below the horizon, settle to the horizon colour rather than showing the
  // underside of the gradient - there is sea and sand down there anyway.
  colour = mix(uHorizon, colour, smoothstep(-0.12, 0.02, dir.y));

  float toSun = max(dot(dir, uSunDir), 0.0);

  // Stars, before the sun and clouds, so both can cover them.
  if (uDaylight < 0.999) {
    vec2 grid = dir.xz / max(0.08, abs(dir.y)) * 90.0;
    float star = hash(floor(grid));
    float twinkle = 0.6 + 0.4 * sin(uTime * 1.7 + star * 90.0);
    float lit = smoothstep(0.9965, 1.0, star) * twinkle;
    // Only above the horizon, and only once the sun is properly down.
    lit *= smoothstep(0.0, 0.2, dir.y) * (1.0 - uDaylight);
    colour += vec3(lit);
  }

  // The sun: a hard disc inside a wide glow.
  colour += uSunColor * pow(toSun, ${SKY.glowSharpness.toFixed(1)}) * 0.28 * uSunStrength;
  colour += uSunColor * pow(toSun, ${SKY.sunSharpness.toFixed(1)}) * 6.0 * uSunStrength;

  // Cloud, projected onto a flat layer so it converges towards the horizon
  // rather than wrapping round the dome like a fisheye.
  if (uCloud > 0.001 && dir.y > -0.02) {
    // The projection runs away to infinity at the horizon. Compressing that
    // distance logarithmically keeps the layer going all the way down with its
    // detail intact; simply not drawing it below a cutoff - which is what this
    // replaces - left a ring of clear sky right round the player.
    float y = max(dir.y, ${SKY.cloudFloor.toFixed(4)});
    vec2 p = dir.xz / y;
    float r = length(p);
    vec2 uv = p * (log(1.0 + r) / max(r, 1e-4)) * ${SKY.cloudScale.toFixed(3)};
    uv += vec2(uTime * ${(SKY.cloudDrift / 1000).toFixed(5)}, uTime * ${(SKY.cloudDrift / 2600).toFixed(5)});

    float n = fbm(uv * 1.6);

    // Thicker towards the horizon: more of the layer is in the way.
    float edge = 1.0 - smoothstep(0.0, ${SKY.edgeRange.toFixed(3)}, dir.y);
    float thickened = min(1.0, uCloud + edge * ${SKY.edgeBoost.toFixed(3)});
    float threshold = 1.05 - thickened * 1.1;
    float cover = smoothstep(threshold, threshold + 0.34, n);

    // Only the last sliver, so nothing is painted below the horizon line.
    cover *= smoothstep(-0.01, 0.045, dir.y);

    // Lit from the sun side, dark underneath, so they read as volumes.
    vec3 lit = mix(uCloudColor, uCloudColor * 0.35, uCloudShade);
    lit = mix(lit, uSunColor, pow(toSun, 4.0) * 0.4 * uSunStrength);
    // And into the haze at the horizon rather than out of existence.
    lit = mix(lit, uHorizon, 1.0 - smoothstep(0.0, ${SKY.hazeTo.toFixed(3)}, dir.y));

    colour = mix(colour, lit, cover);
  }

  gl_FragColor = vec4(colour, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export function SkyDome() {
  const camera = useThree((s) => s.camera)
  const mesh = useRef<Mesh>(null)

  const geometry = useMemo(() => new SphereGeometry(SKY.radius, 32, 20), [])

  const uniforms = useMemo(
    () => ({
      uHorizon: { value: new Color('#a8c8dd') },
      uZenith: { value: new Color('#5f96c8') },
      uSunColor: { value: new Color('#fff3e0') },
      uSunDir: { value: [0, 1, 0] as [number, number, number] },
      uCloudColor: { value: new Color('#ffffff') },
      uSunStrength: { value: 1 },
      uDaylight: { value: 1 },
      uCloud: { value: 0 },
      uCloudShade: { value: 0 },
      uTime: { value: 0 },
    }),
    [],
  )

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
        side: BackSide,
        depthWrite: false,
        // Not a thing at a distance - it is the distance.
        fog: false,
        toneMapped: false,
      }),
    [uniforms],
  )

  useEffect(() => {
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  useGameFrame((state) => {
    const sky = readSky()

    // The dome rides with the camera, so it can never be walked out of.
    if (mesh.current) mesh.current.position.copy(camera.position)

    uniforms.uTime.value = state.clock.elapsedTime
    uniforms.uSunDir.value = [sky.sunX, sky.sunY, sky.sunZ]
    uniforms.uSunColor.value.copy(sky.sunColor)
    uniforms.uSunStrength.value = Math.min(1.6, sky.sunIntensity * 0.55)
    uniforms.uDaylight.value = sky.daylight

    // The horizon takes the fog colour, so the world fades into a sky that is
    // already the same colour it is fading to. Anything else shows a seam.
    uniforms.uHorizon.value.copy(sky.fogColor)
    // And the zenith is the hemisphere's sky colour, a little deeper.
    uniforms.uZenith.value.copy(sky.skyColor).multiplyScalar(0.82)

    uniforms.uCloud.value = sky.weather.cloud
    uniforms.uCloudShade.value = sky.weather.cloudShade
    // Clouds are lit by the sky as much as by the sun, and go grey at night.
    uniforms.uCloudColor.value
      .copy(sky.skyColor)
      .lerp(WHITE, 0.55)
      .multiplyScalar(0.45 + sky.daylight * 0.55)
  }, PRIORITY.world)

  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={-1000}
    />
  )
}

const WHITE = new Color('#ffffff')
