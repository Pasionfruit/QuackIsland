import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, Euler, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three'
import { useParty } from '../../10-party'
import { useGameMode } from '../../13-modes'
import {
  VOLCANO_LANDMARKS,
  type VolcanoLandmarkPose,
  volcanoLandmarkPose,
} from './layout'
import { volcanoLandmarksVisible } from './visibility'

interface Instance {
  matrix: Matrix4
  colour?: Color
}

const matrixAt = (
  x: number,
  y: number,
  z: number,
  yaw: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number,
): Matrix4 =>
  new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion().setFromEuler(new Euler(0, yaw, 0)),
    new Vector3(scaleX, scaleY, scaleZ),
  )

function across(pose: VolcanoLandmarkPose, amount: number) {
  return {
    x: pose.x + pose.normalX * amount,
    z: pose.z + pose.normalZ * amount,
  }
}

function useLandmarkInstances() {
  return useMemo(() => {
    const start = VOLCANO_LANDMARKS.find((landmark) => landmark.kind === 'start')!
    const summit = VOLCANO_LANDMARKS.find((landmark) => landmark.kind === 'summit')!
    const progress = VOLCANO_LANDMARKS.filter((landmark) => landmark.kind === 'progress')
    const startPose = volcanoLandmarkPose(start)
    const summitPose = volcanoLandmarkPose(summit)
    const progressPoses = progress.map((landmark) => ({
      landmark,
      pose: volcanoLandmarkPose(landmark),
    }))

    const startLeft = across(startPose, -1.35)
    const startRight = across(startPose, 1.35)
    const posts: Instance[] = [
      { matrix: matrixAt(startLeft.x, startPose.y + 0.8, startLeft.z, startPose.yaw, 1, 1.6, 1) },
      { matrix: matrixAt(startRight.x, startPose.y + 0.8, startRight.z, startPose.yaw, 1, 1.6, 1) },
      ...progressPoses.map(({ pose }) => ({
        matrix: matrixAt(pose.x, pose.y + 0.48, pose.z, pose.yaw, 0.85, 0.96, 0.85),
      })),
      { matrix: matrixAt(summitPose.x, summitPose.y + 0.7, summitPose.z, summitPose.yaw, 1.1, 1.4, 1.1) },
    ]

    const caps: Instance[] = [
      {
        matrix: matrixAt(startLeft.x, startPose.y + 1.72, startLeft.z, startPose.yaw, 0.78, 0.78, 0.78),
        colour: new Color(start.colour),
      },
      {
        matrix: matrixAt(startRight.x, startPose.y + 1.72, startRight.z, startPose.yaw, 0.78, 0.78, 0.78),
        colour: new Color(start.colour),
      },
      ...progressPoses.map(({ landmark, pose }) => ({
        matrix: matrixAt(pose.x, pose.y + 1.14, pose.z, pose.yaw, 0.82, 1.05, 0.82),
        colour: new Color(landmark.colour),
      })),
    ]

    return {
      startPose,
      summit,
      summitPose,
      posts,
      caps,
    }
  }, [])
}

function Instances({ values, children }: { values: Instance[]; children: React.ReactNode }) {
  const ref = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    values.forEach((value, index) => {
      mesh.setMatrixAt(index, value.matrix)
      if (value.colour) mesh.setColorAt(index, value.colour)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [values])

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, values.length]} castShadow receiveShadow>
      {children}
    </instancedMesh>
  )
}

/** Procedural route furniture. It has no colliders, handlers, or shared state. */
export function VolcanoMapLandmarks() {
  const party = useParty()
  const mode = useGameMode()
  const instances = useLandmarkInstances()

  if (!volcanoLandmarksVisible(mode, party.phase)) return null

  const { startPose, summit, summitPose, posts, caps } = instances

  return (
    <group name="volcano-map-landmarks">
      <Instances values={posts}>
        <cylinderGeometry args={[0.18, 0.24, 1, 6]} />
        <meshStandardMaterial color="#281a20" roughness={0.88} metalness={0.08} />
      </Instances>

      <Instances values={caps}>
        <octahedronGeometry args={[0.32, 0]} />
        <meshStandardMaterial roughness={0.42} emissive="#7a1c08" emissiveIntensity={0.42} />
      </Instances>

      <mesh
        position={[startPose.x, startPose.y + 1.56, startPose.z]}
        rotation={[0, startPose.yaw, 0]}
        castShadow
      >
        <boxGeometry args={[3.08, 0.2, 0.22]} />
        <meshStandardMaterial color="#d76524" roughness={0.62} emissive="#4b1308" emissiveIntensity={0.28} />
      </mesh>

      <mesh
        position={[summitPose.x, summitPose.y + 1.75, summitPose.z]}
        rotation={[0, summitPose.yaw, 0]}
        castShadow
      >
        <coneGeometry args={[0.45, 1.55, 5]} />
        <meshStandardMaterial
          color={summit.colour}
          roughness={0.26}
          emissive="#e82f13"
          emissiveIntensity={0.82}
        />
      </mesh>

      <mesh
        position={[summitPose.x, summitPose.y + 1.22, summitPose.z]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <torusGeometry args={[0.72, 0.065, 4, 12]} />
        <meshStandardMaterial color="#ffb23f" emissive="#ff4c1f" emissiveIntensity={0.7} />
      </mesh>
    </group>
  )
}

