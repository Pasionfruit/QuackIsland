/**
 * Frame and draw-call sampling.
 *
 * Exposed on window as well as through the HUD, so a headless perf gate can be
 * added in a later phase without touching any frozen module - the seam has to
 * exist now because it could not be added afterwards.
 */
import type { WebGLRenderer } from 'three'

export interface PerfSample {
  fps: number
  frameMs: number
  drawCalls: number
  triangles: number
  programs: number
  geometries: number
  textures: number
}

const EMPTY: PerfSample = {
  fps: 0,
  frameMs: 0,
  drawCalls: 0,
  triangles: 0,
  programs: 0,
  geometries: 0,
  textures: 0,
}

let latest: PerfSample = { ...EMPTY }
let frames = 0
let accMs = 0
let sinceReport = 0

export function resetPerf(): void {
  latest = { ...EMPTY }
  frames = 0
  accMs = 0
  sinceReport = 0
}

/** Called once per frame from the render loop. */
export function samplePerf(renderer: WebGLRenderer, deltaMs: number): void {
  frames++
  accMs += deltaMs
  sinceReport += deltaMs
  // Report about four times a second: often enough to be live, rarely enough
  // that reading it does not itself cost frames.
  if (sinceReport < 250) return
  const info = renderer.info
  latest = {
    fps: Math.round((frames / accMs) * 1000),
    frameMs: Number((accMs / frames).toFixed(2)),
    drawCalls: info.render.calls,
    triangles: info.render.triangles,
    programs: info.programs?.length ?? 0,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
  }
  frames = 0
  accMs = 0
  sinceReport = 0
}

export function readPerf(): PerfSample {
  return { ...latest }
}

/** Installs window.__perf() for tooling and for a future automated perf gate. */
export function installPerfProbe(): void {
  if (typeof window === 'undefined') return
  ;(window as unknown as { __perf?: () => PerfSample }).__perf = readPerf
}
