/**
 * The sun, the sky and the fog, wherever the day currently is.
 *
 * The clock advances here, once a frame, and the light is mixed between the
 * two named times it currently sits between. Nothing is stored in React state,
 * so a running cycle costs no re-renders at all - it is pure mutation of three
 * objects that already exist.
 */
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, Fog, type AmbientLight, type DirectionalLight, type HemisphereLight } from 'three'
import { PRIORITY } from './conventions'
import { useGameFrame } from './frame'
import { LIGHTING, advanceCycle, getDayTime, sectionAt, type LightingPreset } from './lighting'

function mixInto(out: Color, a: string, b: string, t: number): void {
  out.set(a)
  out.lerp(scratch.set(b), t)
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function Environment() {
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)

  const sun = useRef<DirectionalLight>(null)
  const ambient = useRef<AmbientLight>(null)
  const hemi = useRef<HemisphereLight>(null)

  const start = useMemo<LightingPreset>(() => {
    const s = sectionAt(getDayTime())
    return LIGHTING[s.from]
  }, [])

  const live = useMemo(
    () => ({
      sun: new Color(start.sunColor),
      ambient: new Color(start.ambientColor),
      sky: new Color(start.skyColor),
      ground: new Color(start.groundColor),
      background: new Color(start.background),
      fog: new Color(start.fogColor),
    }),
    [start],
  )

  useEffect(() => {
    scene.background = live.background
    scene.fog = new Fog(live.fog.getHex(), start.fogNear, start.fogFar)
    return () => {
      scene.background = null
      scene.fog = null
    }
  }, [scene, live, start])

  useGameFrame((_state, delta) => {
    advanceCycle(delta)

    const { from, to, blend } = sectionAt(getDayTime())
    const a = LIGHTING[from]
    const b = LIGHTING[to]

    mixInto(live.sun, a.sunColor, b.sunColor, blend)
    mixInto(live.ambient, a.ambientColor, b.ambientColor, blend)
    mixInto(live.sky, a.skyColor, b.skyColor, blend)
    mixInto(live.ground, a.groundColor, b.groundColor, blend)
    mixInto(live.background, a.background, b.background, blend)
    mixInto(live.fog, a.fogColor, b.fogColor, blend)

    if (sun.current) {
      sun.current.color.copy(live.sun)
      sun.current.intensity = mix(a.sunIntensity, b.sunIntensity, blend)
      sun.current.position.set(
        mix(a.sunPosition[0], b.sunPosition[0], blend),
        mix(a.sunPosition[1], b.sunPosition[1], blend),
        mix(a.sunPosition[2], b.sunPosition[2], blend),
      )
    }
    if (ambient.current) {
      ambient.current.color.copy(live.ambient)
      ambient.current.intensity = mix(a.ambientIntensity, b.ambientIntensity, blend)
    }
    if (hemi.current) {
      hemi.current.color.copy(live.sky)
      hemi.current.groundColor.copy(live.ground)
      hemi.current.intensity = mix(a.hemiIntensity, b.hemiIntensity, blend)
    }
    if (scene.fog instanceof Fog) {
      scene.fog.color.copy(live.fog)
      scene.fog.near = mix(a.fogNear, b.fogNear, blend)
      scene.fog.far = mix(a.fogFar, b.fogFar, blend)
    }
    gl.toneMappingExposure = mix(a.exposure, b.exposure, blend)
  }, PRIORITY.world)

  return (
    <>
      <hemisphereLight ref={hemi} args={[start.skyColor, start.groundColor, start.hemiIntensity]} />
      <ambientLight ref={ambient} intensity={start.ambientIntensity} color={start.ambientColor} />
      <directionalLight
        ref={sun}
        castShadow
        position={start.sunPosition}
        intensity={start.sunIntensity}
        color={start.sunColor}
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

const scratch = new Color()
