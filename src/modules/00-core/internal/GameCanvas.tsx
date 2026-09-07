/**
 * The one canvas, the one render loop, the one set of lights.
 *
 * All of this is singular and cannot be retrofitted: a module that set up its
 * own lighting could not be corrected later without unfreezing it. So it lives
 * here, decided once, and modules render content into it as children.
 *
 * IMPORTANT, and the reason rendering is explicit below: in react-three-fiber,
 * any useFrame callback with a priority above 0 switches the loop to manual and
 * react-three-fiber stops rendering for you. Because this project orders work
 * with named PRIORITY bands, that is always the case here - so this module owns
 * the render call, at the end of the frame, and every other module can use a
 * band without knowing any of this.
 */
import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useRef, type ReactNode } from 'react'
import { ACESFilmicToneMapping, PCFSoftShadowMap } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { PRIORITY } from './conventions'
import { useGameFrame } from './frame'
import { installPerfProbe, resetPerf, samplePerf } from './perf'
import { Environment } from './Environment'
import { useCameraMode } from './view'

/** Renders the frame and then reads the counters it produced. */
function RenderLoop() {
  useGameFrame((state, delta) => {
    state.gl.render(state.scene, state.camera)
    samplePerf(state.gl, delta * 1000)
  }, PRIORITY.post)
  return null
}

/** A debug camera for inspecting whatever a module is building. */
function DebugOrbit() {
  const mode = useCameraMode()
  const camera = useThree((s) => s.camera)
  const domElement = useThree((s) => s.gl.domElement)
  const controls = useRef<OrbitControls | null>(null)

  useEffect(() => {
    if (mode !== 'orbit') return
    const c = new OrbitControls(camera, domElement)
    c.enableDamping = true
    c.dampingFactor = 0.08
    c.maxPolarAngle = Math.PI * 0.495 // stop just above the horizon, never under the world
    c.minDistance = 2
    c.maxDistance = 4000
    controls.current = c
    return () => {
      c.dispose()
      controls.current = null
    }
  }, [camera, domElement, mode])

  useGameFrame(() => controls.current?.update(), PRIORITY.camera)
  return null
}

export function GameCanvas({ children }: { children?: ReactNode }) {
  useEffect(() => {
    installPerfProbe()
    resetPerf()
  }, [])

  return (
    <Canvas
      shadows={{ type: PCFSoftShadowMap }}
      dpr={[1, 2]}
      camera={{ fov: 55, near: 0.5, far: 5000, position: [180, 120, 180] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
      }}
    >
      <Environment />
      {children}
      <DebugOrbit />
      <RenderLoop />
    </Canvas>
  )
}
