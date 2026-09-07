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
  const camera = useThree((s) => s.camera)
  const domElement = useThree((s) => s.gl.domElement)
  const controls = useRef<OrbitControls | null>(null)

  useEffect(() => {
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
  }, [camera, domElement])

  useGameFrame(() => controls.current?.update(), PRIORITY.camera)
  return null
}

/** Sun and sky fill. Warm key from the south-west, cool bounce from above. */
function Lighting() {
  return (
    <>
      <hemisphereLight args={['#bcd6ff', '#8a7f6a', 0.9]} />
      <directionalLight
        castShadow
        position={[120, 180, 90]}
        intensity={2.4}
        color="#fff3e0"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={600}
        shadow-camera-left={-250}
        shadow-camera-right={250}
        shadow-camera-top={250}
        shadow-camera-bottom={-250}
        shadow-bias={-0.0005}
      />
      <ambientLight intensity={0.35} color="#cfe3ff" />
    </>
  )
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
      <color attach="background" args={['#9fc4dd']} />
      <fog attach="fog" args={['#a8c8dd', 600, 2600]} />
      <Lighting />
      {children}
      <DebugOrbit />
      <RenderLoop />
    </Canvas>
  )
}
