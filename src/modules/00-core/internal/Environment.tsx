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
import {
  WEATHER,
  WEATHER_FADE,
  applyWeather,
  blendWeather,
  getWeather,
  type WeatherKind,
  type WeatherPreset,
} from './weather'

/**
 * What the sky currently looks like, for anything that has to draw against it.
 *
 * The sky module needs the sun's direction to put a sun in it, the horizon and
 * zenith colours to fade between, and how much cloud there is. All of that is
 * already worked out here once a frame, and recomputing it there would be a
 * second implementation of the same mix, free to drift.
 *
 * Read-only, mutated in place, and never in React state - it changes every
 * frame.
 */
export interface SkyState {
  /** Direction *towards* the sun, unit length. */
  sunX: number
  sunY: number
  sunZ: number
  sunIntensity: number
  /** 0 at night, 1 in full daylight. Fades the stars in and out. */
  daylight: number
  sunColor: Color
  skyColor: Color
  fogColor: Color
  /** The weather, already eased, so a change comes over rather than snaps. */
  weather: WeatherPreset
}

const skyState: SkyState = {
  sunX: 0,
  sunY: 1,
  sunZ: 0,
  sunIntensity: 1,
  daylight: 1,
  sunColor: new Color('#ffffff'),
  skyColor: new Color('#bcd6ff'),
  fogColor: new Color('#a8c8dd'),
  weather: { ...WEATHER.sunny },
}

export function readSky(): Readonly<SkyState> {
  return skyState
}

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

  // Weather eases from whatever it was to whatever was picked, so switching it
  // is a front coming over rather than a cut.
  const fade = useRef<{ from: WeatherPreset; to: WeatherKind; t: number }>({
    from: WEATHER[getWeather()],
    to: getWeather(),
    t: 1,
  })

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

    // Where the weather has got to.
    const wanted: WeatherKind = getWeather()
    const f = fade.current
    if (wanted !== f.to) {
      // Start from wherever the last change had actually reached, not from the
      // preset it was heading for, so flicking between two does not jump.
      f.from = blendWeather(f.from, WEATHER[f.to], f.t)
      f.to = wanted
      f.t = 0
    }
    f.t = Math.min(1, f.t + delta / WEATHER_FADE)
    const weather = blendWeather(f.from, WEATHER[f.to], f.t)
    skyState.weather = weather

    mixInto(live.sun, a.sunColor, b.sunColor, blend)
    mixInto(live.ambient, a.ambientColor, b.ambientColor, blend)
    mixInto(live.sky, a.skyColor, b.skyColor, blend)
    mixInto(live.ground, a.groundColor, b.groundColor, blend)
    mixInto(live.background, a.background, b.background, blend)
    mixInto(live.fog, a.fogColor, b.fogColor, blend)

    // Overcast drags every colour towards a flat grey. Without this, rain is
    // just sunshine with particles falling through it.
    if (weather.grey > 0) {
      grey.set(weather.greyColor)
      live.sun.lerp(grey, weather.grey * 0.75)
      live.ambient.lerp(grey, weather.grey)
      live.sky.lerp(grey, weather.grey)
      live.background.lerp(grey, weather.grey)
      live.fog.lerp(grey, weather.grey)
    }

    const lit = applyWeather(
      {
        sunIntensity: mix(a.sunIntensity, b.sunIntensity, blend),
        ambientIntensity: mix(a.ambientIntensity, b.ambientIntensity, blend),
        hemiIntensity: mix(a.hemiIntensity, b.hemiIntensity, blend),
        fogNear: mix(a.fogNear, b.fogNear, blend),
        fogFar: mix(a.fogFar, b.fogFar, blend),
        exposure: mix(a.exposure, b.exposure, blend),
      },
      weather,
    )

    const sunX = mix(a.sunPosition[0], b.sunPosition[0], blend)
    const sunY = mix(a.sunPosition[1], b.sunPosition[1], blend)
    const sunZ = mix(a.sunPosition[2], b.sunPosition[2], blend)

    if (sun.current) {
      sun.current.color.copy(live.sun)
      sun.current.intensity = lit.sunIntensity
      sun.current.position.set(sunX, sunY, sunZ)
    }
    if (ambient.current) {
      ambient.current.color.copy(live.ambient)
      ambient.current.intensity = lit.ambientIntensity
    }
    if (hemi.current) {
      hemi.current.color.copy(live.sky)
      hemi.current.groundColor.copy(live.ground)
      hemi.current.intensity = lit.hemiIntensity
    }
    if (scene.fog instanceof Fog) {
      scene.fog.color.copy(live.fog)
      scene.fog.near = lit.fogNear
      scene.fog.far = lit.fogFar
    }
    gl.toneMappingExposure = lit.exposure

    // Hand the sky what it needs, rather than have it mix all of this again.
    const length = Math.hypot(sunX, sunY, sunZ) || 1
    skyState.sunX = sunX / length
    skyState.sunY = sunY / length
    skyState.sunZ = sunZ / length
    skyState.sunIntensity = lit.sunIntensity
    // Sun height above the horizon, which is what actually says "daytime".
    skyState.daylight = Math.min(1, Math.max(0, skyState.sunY * 3))
    skyState.sunColor.copy(live.sun)
    skyState.skyColor.copy(live.sky)
    skyState.fogColor.copy(live.fog)
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
const grey = new Color()
