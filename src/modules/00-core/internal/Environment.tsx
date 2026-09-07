/**
 * The sun, the sky and the fog, blended toward whichever time of day is set.
 *
 * The blend is the point: dragging the slider from daylight to night should
 * look like the sun going down, not like someone flicking a switch. Everything
 * eases toward the target every frame, so any change - from the slider now,
 * from a day/night cycle later - is smooth without the caller doing anything.
 */
import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Color, Fog, type DirectionalLight, type AmbientLight, type HemisphereLight } from 'three'
import { PRIORITY } from './conventions'
import { useGameFrame } from './frame'
import { LIGHTING, useTimeOfDay, type LightingPreset } from './lighting'

/** Roughly how long a change takes to settle, in seconds. */
const EASE = 0.55

function approach(current: number, target: number, delta: number): number {
  // Frame-rate independent easing: same settling time at 30fps or 144.
  const t = 1 - Math.exp(-delta / EASE)
  return current + (target - current) * t
}

export function Environment() {
  const time = useTimeOfDay()
  const preset = LIGHTING[time]

  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)

  const sun = useRef<DirectionalLight>(null)
  const ambient = useRef<AmbientLight>(null)
  const hemi = useRef<HemisphereLight>(null)

  // Live values, eased toward the preset. Kept in refs so changing the time of
  // day never triggers a React re-render mid-blend.
  const live = useRef({
    sunColor: new Color(preset.sunColor),
    ambientColor: new Color(preset.ambientColor),
    skyColor: new Color(preset.skyColor),
    groundColor: new Color(preset.groundColor),
    background: new Color(preset.background),
    fogColor: new Color(preset.fogColor),
    sunIntensity: preset.sunIntensity,
    ambientIntensity: preset.ambientIntensity,
    hemiIntensity: preset.hemiIntensity,
    fogNear: preset.fogNear,
    fogFar: preset.fogFar,
    exposure: preset.exposure,
    sunPos: [...preset.sunPosition] as [number, number, number],
  })

  const target = useRef<LightingPreset>(preset)
  target.current = preset

  useEffect(() => {
    scene.background = live.current.background
    scene.fog = new Fog(live.current.fogColor.getHex(), live.current.fogNear, live.current.fogFar)
  }, [scene])

  useGameFrame((_state, delta) => {
    const t = target.current
    const l = live.current
    const d = Math.min(delta, 0.1)

    l.sunColor.lerp(tmpA.set(t.sunColor), 1 - Math.exp(-d / EASE))
    l.ambientColor.lerp(tmpA.set(t.ambientColor), 1 - Math.exp(-d / EASE))
    l.skyColor.lerp(tmpA.set(t.skyColor), 1 - Math.exp(-d / EASE))
    l.groundColor.lerp(tmpA.set(t.groundColor), 1 - Math.exp(-d / EASE))
    l.background.lerp(tmpA.set(t.background), 1 - Math.exp(-d / EASE))
    l.fogColor.lerp(tmpA.set(t.fogColor), 1 - Math.exp(-d / EASE))

    l.sunIntensity = approach(l.sunIntensity, t.sunIntensity, d)
    l.ambientIntensity = approach(l.ambientIntensity, t.ambientIntensity, d)
    l.hemiIntensity = approach(l.hemiIntensity, t.hemiIntensity, d)
    l.fogNear = approach(l.fogNear, t.fogNear, d)
    l.fogFar = approach(l.fogFar, t.fogFar, d)
    l.exposure = approach(l.exposure, t.exposure, d)
    for (let i = 0; i < 3; i++) l.sunPos[i] = approach(l.sunPos[i], t.sunPosition[i], d)

    if (sun.current) {
      sun.current.color.copy(l.sunColor)
      sun.current.intensity = l.sunIntensity
      sun.current.position.set(l.sunPos[0], l.sunPos[1], l.sunPos[2])
    }
    if (ambient.current) {
      ambient.current.color.copy(l.ambientColor)
      ambient.current.intensity = l.ambientIntensity
    }
    if (hemi.current) {
      hemi.current.color.copy(l.skyColor)
      hemi.current.groundColor.copy(l.groundColor)
      hemi.current.intensity = l.hemiIntensity
    }
    if (scene.background instanceof Color) scene.background.copy(l.background)
    if (scene.fog instanceof Fog) {
      scene.fog.color.copy(l.fogColor)
      scene.fog.near = l.fogNear
      scene.fog.far = l.fogFar
    }
    gl.toneMappingExposure = l.exposure
  }, PRIORITY.world)

  return (
    <>
      <hemisphereLight ref={hemi} args={[preset.skyColor, preset.groundColor, preset.hemiIntensity]} />
      <ambientLight ref={ambient} intensity={preset.ambientIntensity} color={preset.ambientColor} />
      <directionalLight
        ref={sun}
        castShadow
        position={preset.sunPosition}
        intensity={preset.sunIntensity}
        color={preset.sunColor}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={900}
        shadow-camera-left={-330}
        shadow-camera-right={330}
        shadow-camera-top={330}
        shadow-camera-bottom={-330}
        shadow-bias={-0.0006}
        shadow-normalBias={0.4}
      />
    </>
  )
}

const tmpA = new Color()
