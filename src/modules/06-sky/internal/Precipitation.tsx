/**
 * Rain and snow.
 *
 * One instanced quad, a few thousand times, in a box that rides with the
 * camera. Nothing moves on the CPU: each particle's height is `mod(start -
 * time * fall, boxHeight)` in the vertex shader, so falling costs one uniform
 * a frame however many there are.
 *
 * The box moving with the camera is what makes a few thousand particles look
 * like weather over a whole island. They are uniformly distributed, so
 * shifting the box shifts them all and nothing pops - you cannot tell it from
 * rain that carries on past the horizon.
 *
 * Quads rather than points: rain has to be a streak, and a point sprite cannot
 * be one. They billboard about the Y axis only, which keeps rain falling
 * vertically no matter where you look. A full billboard would tip the streaks
 * over as you looked up.
 */
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
} from 'three'
import { CONVENTIONS, PRIORITY, createRng, hashSeed, readSky, useGameFrame } from '../../00-core'
import { PRECIPITATION } from './fall'

const vertexShader = /* glsl */ `
uniform float uTime;
uniform vec3 uBox;
uniform vec2 uSize;
uniform float uFall;
uniform float uDrift;
uniform float uAmount;

attribute vec3 aStart;
/** x: which way it sways, y: how fast, z: fade-out order. */
attribute vec3 aSeed;

varying float vAlpha;
varying vec2 vLocal;

void main() {
  // Thinning out fades the tail of the list rather than moving anything, so
  // rain easing off does not visibly rearrange itself.
  vAlpha = step(aSeed.z, uAmount);

  vec3 centre = aStart;
  // Falling is one modulo. Nothing about this touches the CPU.
  centre.y = mod(aStart.y - uTime * uFall, uBox.y) - uBox.y * 0.5;

  // Snow wanders on the way down; rain does not.
  centre.x += sin(uTime * aSeed.y + aSeed.x * 6.283) * uDrift;
  centre.z += cos(uTime * aSeed.y * 0.8 + aSeed.x * 6.283) * uDrift;

  // Billboard about Y only, so the streaks stay upright.
  vec3 world = (modelMatrix * vec4(centre, 1.0)).xyz;
  vec3 toCam = cameraPosition - world;
  vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x));

  vec3 offset = right * (position.x * uSize.x) + vec3(0.0, position.y * uSize.y, 0.0);
  vLocal = position.xy;

  gl_Position = projectionMatrix * viewMatrix * vec4(world + offset, 1.0);
}
`

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uRound;

varying float vAlpha;
varying vec2 vLocal;

void main() {
  if (vAlpha < 0.5) discard;

  float shape = 1.0;
  // Snow is a soft disc; rain is a streak that fades at both ends.
  shape *= mix(
    1.0 - smoothstep(0.25, 0.5, abs(vLocal.y)),
    1.0 - smoothstep(0.0, 0.5, length(vLocal)),
    uRound
  );
  shape *= 1.0 - smoothstep(0.2, 0.5, abs(vLocal.x));
  if (shape <= 0.01) discard;

  gl_FragColor = vec4(uColor, shape * uOpacity);
}
`

/**
 * The particle system. One of these covers both rain and snow: they differ in
 * size, speed, drift, colour and blending, and in nothing else.
 */
export function Precipitation() {
  const camera = useThree((s) => s.camera)
  const mesh = useRef<InstancedMesh>(null)
  /** Eased, so weather arriving and leaving is a fade rather than a switch. */
  const amount = useRef(0)
  /** What is currently built. Changing type needs the particles rebuilt. */
  const shown = useRef<'none' | 'rain' | 'snow'>('none')

  const geometry = useMemo(() => new PlaneGeometry(1, 1), [])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBox: { value: [PRECIPITATION.box, PRECIPITATION.boxHeight, PRECIPITATION.box] },
      uSize: { value: [0.03, 0.5] },
      uFall: { value: 20 },
      uDrift: { value: 0 },
      uAmount: { value: 0 },
      uColor: { value: new Color('#cfe6f2') },
      uOpacity: { value: 0.5 },
      uRound: { value: 0 },
    }),
    [],
  )

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        fog: false,
      }),
    [uniforms],
  )

  // Positions for the biggest count any weather asks for, made once. Thinning
  // out is done by fading the tail, not by rebuilding.
  const { starts, seeds } = useMemo(() => {
    const rng = createRng(hashSeed(CONVENTIONS.worldSeed, 'precipitation'))
    const n = PRECIPITATION.max
    const starts = new Float32Array(n * 3)
    const seeds = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      starts[i * 3] = (rng() - 0.5) * PRECIPITATION.box
      starts[i * 3 + 1] = rng() * PRECIPITATION.boxHeight
      starts[i * 3 + 2] = (rng() - 0.5) * PRECIPITATION.box
      seeds[i * 3] = rng()
      seeds[i * 3 + 1] = 0.4 + rng() * 1.2
      // Fade order, so thinning out always drops the same ones.
      seeds[i * 3 + 2] = (i + 1) / n
    }
    return { starts, seeds }
  }, [])

  useEffect(() => {
    const m = mesh.current
    if (!m) return
    m.geometry.setAttribute('aStart', new InstancedBufferAttribute(starts, 3))
    m.geometry.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 3))
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [starts, seeds, geometry, material])

  useGameFrame((state, delta) => {
    const m = mesh.current
    if (!m) return

    const weather = readSky().weather
    const wanted = weather.precipitation

    // Fade out before swapping type, so rain never turns into snow mid-air.
    const target = wanted === shown.current ? weather.count / PRECIPITATION.max : 0
    const rate = delta / PRECIPITATION.fade
    amount.current += Math.max(-rate, Math.min(rate, target - amount.current))

    if (amount.current <= 0.001 && wanted !== shown.current) {
      shown.current = wanted
    }

    const kind = shown.current
    m.visible = kind !== 'none' && amount.current > 0.001
    if (!m.visible) return

    const style = kind === 'snow' ? PRECIPITATION.snow : PRECIPITATION.rain
    uniforms.uTime.value = state.clock.elapsedTime
    uniforms.uAmount.value = amount.current
    uniforms.uSize.value = [style.width, style.height]
    uniforms.uFall.value = weather.fall > 0 ? weather.fall : style.fall
    uniforms.uDrift.value = style.drift
    uniforms.uRound.value = style.round
    uniforms.uOpacity.value = style.opacity
    uniforms.uColor.value.set(style.color)
    material.blending = kind === 'snow' ? NormalBlending : AdditiveBlending

    // Ride with the camera. Snapped to whole metres so the box does not
    // shimmer as it slides underneath the particles.
    m.position.set(
      Math.round(camera.position.x),
      Math.round(camera.position.y),
      Math.round(camera.position.z),
    )
  }, PRIORITY.world)

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, PRECIPITATION.max]}
      frustumCulled={false}
      visible={false}
      renderOrder={20}
    />
  )
}
