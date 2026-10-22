import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import { Group, InstancedMesh, Object3D, PerspectiveCamera, Vector3 } from 'three'
import { getCameraMode, PRIORITY, setCameraMode, useGameFrame } from '../../00-core'
import { createAvatar } from '../../02-player'
import { courseFor, HALF_LENGTH, HALF_WIDTH } from './course'
import { activeTeam, CHAIN_LENGTH, PALETTE, type Hands, type Player, type Round } from './rules'

function Character({ player, colour, mine }: { player: Player; colour: string; mine: boolean }) {
  const body = useRef<Group>(null)
  const avatar=useMemo(()=>createAvatar(colour),[colour])
  useGameFrame(() => {
    const g = body.current
    if (!g) return
    g.position.set(player.x, .03, player.z)
    const dx = -Math.sin(player.yaw) * player.forward + Math.cos(player.yaw) * player.strafe
    const dz = -Math.cos(player.yaw) * player.forward - Math.sin(player.yaw) * player.strafe
    if (Math.hypot(dx, dz) > .03) g.rotation.y = Math.atan2(-dx, -dz)
  }, PRIORITY.world)
  return <group ref={body}>
    <group rotation={[0,Math.PI,0]} scale={.7}><primitive object={avatar}/></group>
    {mine && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .015, 0]}><ringGeometry args={[.47, .57, 20]} /><meshBasicMaterial color="#fff6cf" /></mesh>}
  </group>
}
function Chains({ round }: { round: Round }) {
  const mesh = useRef<InstancedMesh>(null)
  const transform = useMemo(() => new Object3D(), []), direction = useMemo(() => new Vector3(), []), axis = useMemo(() => new Vector3(1, 0, 0), [])
  useGameFrame(() => {
    if (!mesh.current) return
    const team = activeTeam(round)
    mesh.current.count = Math.max(0, team.length - 1) * 12
    for (let pair = 0; pair < team.length - 1; pair++) {
      const a = team[pair], b = team[pair + 1], d = Math.hypot(b.x - a.x, b.z - a.z)
      direction.set(b.x - a.x, 0, b.z - a.z).normalize()
      for (let i = 0; i < 12; i++) {
        const t = (i + .5) / 12
        transform.position.set(a.x + (b.x - a.x) * t, .59 - Math.sin(t * Math.PI) * Math.min(.28, (CHAIN_LENGTH - d) * .3), a.z + (b.z - a.z) * t)
        transform.quaternion.setFromUnitVectors(axis, direction)
        if (i % 2) transform.rotateX(Math.PI / 2)
        transform.scale.set(Math.max(.4, d / CHAIN_LENGTH) * 1.15, .8, .8)
        transform.updateMatrix(); mesh.current.setMatrixAt(pair * 12 + i, transform.matrix)
      }
    }
    mesh.current.instanceMatrix.needsUpdate = true
  }, PRIORITY.world)
  return <instancedMesh ref={mesh} args={[undefined, undefined, 72]} frustumCulled={false}><torusGeometry args={[.1, .022, 3, 4]} /><meshStandardMaterial color={round.tension > .97 ? '#b2876c' : '#728c91'} metalness={.3} roughness={.55} /></instancedMesh>
}
function FollowCamera({ round, hands }: { round: Round; hands: RefObject<Hands> }) {
  const { camera } = useThree()
  useEffect(() => {
    const old = getCameraMode(); setCameraMode('player')
    const p = camera as PerspectiveCamera; p.fov = 57; p.near = .08; p.far = 120; p.updateProjectionMatrix()
    return () => setCameraMode(old)
  }, [camera])
  useGameFrame(() => {
    const p = round.players.find((p) => p.mine && !p.left) ?? round.players.find((p) => !p.left)
    if (!p) return
    const { yaw, pitch } = hands.current, dir = { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) }
    let distance = 9
    const obstacles = courseFor(round.seed).obstacles
    for (let d = .5; d < 9; d += .35) if (obstacles.some((c) => Math.abs(p.x + dir.x*d - c.x) < c.w/2+.15 && Math.abs(p.z + dir.z*d - c.z) < c.d/2+.15 && .7+dir.y*d < c.h+.15)) { distance = Math.max(.6, d-.35); break }
    camera.position.set(p.x + dir.x * distance, .7 + dir.y * distance, p.z + dir.z * distance)
    camera.lookAt(p.x, .65, p.z)
  }, PRIORITY.camera)
  return null
}
function Marker({ x, z, colour, done, current }: { x: number; z: number; colour: string; done: boolean; current: boolean }) {
  return <group position={[x, 0, z]}>
    <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, .025, 0]}><ringGeometry args={[1.2, 1.45, 24]} /><meshBasicMaterial color={done ? '#91b9a4' : colour} transparent opacity={current ? 1 : .35} /></mesh>
    <mesh position={[0, .8, 0]}><cylinderGeometry args={[.045, .045, 1.6, 5]} /><meshStandardMaterial color="#b0a58b" /></mesh>
    <mesh position={[.35, 1.4, 0]} rotation={[0, 0, -Math.PI/2]}><coneGeometry args={[.25, .7, 3]} /><meshStandardMaterial color={done ? '#91b9a4' : colour} /></mesh>
  </group>
}
export function Arena({ round, hands, advance }: { round: Round; hands: RefObject<Hands>; advance: (dt: number) => void }) {
  const course = courseFor(round.seed)
  useGameFrame((_state, dt) => advance(Math.min(dt, .05)), PRIORITY.simulation)
  return <>
    <mesh position={[0, -.25, 0]}><boxGeometry args={[HALF_WIDTH*2+.8, .5, HALF_LENGTH*2+.8]} /><meshStandardMaterial color="#e1ddc8" /></mesh>
    {[-1, 1].map((side) => <group key={side}>
      <mesh position={[side*(HALF_WIDTH+.2), .15, 0]}><boxGeometry args={[.4, .3, HALF_LENGTH*2+.8]} /><meshStandardMaterial color="#9abbb9" /></mesh>
      <mesh position={[0, .15, side*(HALF_LENGTH+.2)]}><boxGeometry args={[HALF_WIDTH*2, .3, .4]} /><meshStandardMaterial color="#9abbb9" /></mesh>
    </group>)}
    {course.obstacles.map((c, i) => <group key={i} position={[c.x, 0, c.z]}>
      <mesh position={[0, c.h/2, 0]}><boxGeometry args={[c.w, c.h, c.d]} /><meshStandardMaterial color="#a9bdb8" /></mesh>
      <mesh position={[0, c.h+.06, 0]}><boxGeometry args={[c.w+.1, .12, c.d+.1]} /><meshStandardMaterial color="#c2cfbf" /></mesh>
    </group>)}
    {course.checkpoints.map((p, i) => <Marker key={i} {...p} colour={['#dcaa68', '#d29184', '#87ada7'][i]} done={i < round.checkpoint} current={i === round.checkpoint} />)}
    <group position={[course.finish.x, 0, course.finish.z]}>
      {[-2, 2].map((x) => <mesh key={x} position={[x, 1.8, 0]}><boxGeometry args={[.25, 3.6, .35]} /><meshStandardMaterial color="#6d9391" /></mesh>)}
      <mesh position={[0, 3.5, 0]}><boxGeometry args={[4.3, .4, .35]} /><meshStandardMaterial color={round.checkpoint === 3 ? '#dbb46a' : '#799b98'} /></mesh>
      <mesh position={[0, .02, 0]}><boxGeometry args={[4, .03, .6]} /><meshStandardMaterial color="#5c8585" /></mesh>
    </group>
    {round.players.filter((p) => !p.left).map((p, i) => <Character key={p.id} player={p} colour={p.role === 'solo' ? PALETTE[0] : PALETTE[(i % (PALETTE.length-1))+1]} mine={p.mine} />)}
    <Chains round={round} />
    <FollowCamera round={round} hands={hands} />
  </>
}
