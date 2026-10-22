import { useEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Group, InstancedMesh, Object3D, PerspectiveCamera } from 'three'
import { createRng, getCameraMode, hashSeed, PRIORITY, setCameraMode, useGameFrame } from '../../00-core'
import { createAvatar } from '../../02-player'
import { arenaFor, EDGE } from './arena'
import { direction, eye, PALETTE, standing, type Player, type Round } from './rules'

function Reeds({ seed }: { seed: number }) {
  const reeds = useRef<InstancedMesh>(null)
  const trees = useRef<InstancedMesh>(null)
  const crowns = useRef<InstancedMesh>(null)
  useEffect(() => {
    const rng = createRng(hashSeed(seed, 'duck-szn:plants')), transform = new Object3D()
    for (let i = 0; i < 150; i++) {
      transform.position.set((rng() - 0.5) * 44, 0.26, (rng() - 0.5) * 44)
      transform.rotation.set(0, rng() * Math.PI, (rng() - 0.5) * 0.25)
      transform.scale.set(0.3, 0.6 + rng() * 0.6, 0.3); transform.updateMatrix()
      reeds.current?.setMatrixAt(i, transform.matrix)
    }
    for (let i = 0; i < 28; i++) {
      const angle = i * Math.PI * 2 / 28
      transform.position.set(Math.sin(angle) * 28, 1.9, Math.cos(angle) * 28)
      transform.rotation.set(0, 0, 0); transform.scale.set(1, 1, 1); transform.updateMatrix(); trees.current?.setMatrixAt(i, transform.matrix)
      transform.position.y = 4.5 + rng(); transform.scale.set(1.5 + rng(), 2, 1.5 + rng()); transform.updateMatrix(); crowns.current?.setMatrixAt(i, transform.matrix)
    }
    for (const mesh of [reeds.current, trees.current, crowns.current]) if (mesh) mesh.instanceMatrix.needsUpdate = true
  }, [seed])
  return <>
    <instancedMesh ref={reeds} args={[undefined, undefined, 150]}><coneGeometry args={[0.26, 1, 3]} /><meshStandardMaterial color="#a1b68c" flatShading /></instancedMesh>
    <instancedMesh ref={trees} args={[undefined, undefined, 28]}><cylinderGeometry args={[0.18, 0.3, 3.8, 5]} /><meshStandardMaterial color="#6e7962" flatShading /></instancedMesh>
    <instancedMesh ref={crowns} args={[undefined, undefined, 28]}><icosahedronGeometry args={[1.2, 0]} /><meshStandardMaterial color="#6c947b" flatShading /></instancedMesh>
  </>
}
function Body({ player, colour }: { player: Player; colour: string }) {
  const group = useRef<Group>(null)
  const avatar=useMemo(()=>createAvatar(colour),[colour])
  useGameFrame(() => {
    if (!group.current) return
    group.current.position.set(player.x, 0, player.z)
    group.current.rotation.y = player.yaw
    group.current.scale.y = player.crouch ? 0.4 : 1
  }, PRIORITY.world)
  if (player.role === 'hunter') return <group ref={group}>
    <group rotation={[0,Math.PI,0]}><primitive object={avatar}/></group>
    <mesh position={[0, 1.72, 0]}><cylinderGeometry args={[0.27, 0.32, 0.17, 8]} /><meshStandardMaterial color="#d38b4c" /></mesh>
    <mesh position={[0.3, 1.08, -0.4]}><boxGeometry args={[0.1, 0.12, 0.8]} /><meshStandardMaterial color="#3d4947" /></mesh>
  </group>
  return <group ref={group}>
    <group rotation={[0,Math.PI,0]} scale={.54}><primitive object={avatar}/></group>
  </group>
}
function Camera({ round }: { round: Round }) {
  const { camera } = useThree()
  useEffect(() => {
    const previous = getCameraMode()
    setCameraMode('player')
    const view = camera as PerspectiveCamera
    view.fov = 76; view.near = 0.045; view.far = 110; view.updateProjectionMatrix()
    return () => setCameraMode(previous)
  }, [camera])
  useGameFrame(() => {
    const mine = round.players.find((p) => p.mine)
    const follow = mine && standing(mine) ? mine : round.players.find((p) => p.role === 'duck' && standing(p)) ?? round.players.find(standing)
    if (!follow) return
    const e = eye(follow)
    camera.position.set(e.x, e.y, e.z)
    camera.rotation.set(follow.pitch, follow.yaw, 0, 'YXZ')
  }, PRIORITY.camera)
  return null
}

export function Marsh({ round, advance }: { round: Round; advance: (dt: number) => void }) {
  const a = useMemo(() => arenaFor(round.seed), [round.seed])
  const mine = round.players.find((p) => p.mine)
  const followed = mine && standing(mine) ? mine : round.players.find((p) => p.role === 'duck' && standing(p)) ?? round.players.find(standing)
  useGameFrame((_state, dt) => advance(Math.min(0.05, dt)), PRIORITY.simulation)
  const shot = round.shot
  const ray = shot ? direction(shot.yaw, shot.pitch) : null
  const shotHeight = 1.62
  return <>
    <color attach="background" args={['#c8d9ce']} /><fog attach="fog" args={['#c8d9ce', 22, 65]} />
    <mesh position={[0, -0.08, 0]}><boxGeometry args={[60, 0.16, 60]} /><meshStandardMaterial color="#7e9d7a" roughness={1} /></mesh>
    {[-1, 1].map((s) => <mesh key={s} position={[s * 20, 0.005, s * 12]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.6, 1, 1]}><circleGeometry args={[4.2, 16]} /><meshStandardMaterial color="#88b5b1" roughness={0.3} /></mesh>)}
    {a.cover.map((c, i) => <group key={i} position={[c.x, 0, c.z]}>
      <mesh position={[0, c.h / 2, 0]}><boxGeometry args={[c.w, c.h, c.d]} /><meshStandardMaterial color={c.kind === 'log' ? '#8a8061' : '#8d9c8c'} roughness={1} /></mesh>
      {c.kind === 'log' ? <mesh position={[0, c.h + 0.015, 0]}><boxGeometry args={[c.w * 0.94, 0.04, c.d * 0.9]} /><meshStandardMaterial color="#b0ac81" /></mesh> : <mesh position={[0, c.h + 0.1, 0]}><boxGeometry args={[c.w * 0.83, 0.2, c.d * 0.83]} /><meshStandardMaterial color="#9ca990" /></mesh>}
    </group>)}
    <Reeds seed={round.seed} />
    {[-1, 1].map((s) => <group key={s}>
      <mesh position={[s * (EDGE + 0.25), 0.45, 0]}><boxGeometry args={[0.5, 0.9, EDGE * 2 + 1]} /><meshStandardMaterial color="#667c66" /></mesh>
      <mesh position={[0, 0.45, s * (EDGE + 0.25)]}><boxGeometry args={[EDGE * 2, 0.9, 0.5]} /><meshStandardMaterial color="#667c66" /></mesh>
    </group>)}
    {round.players.filter((p) => standing(p) && p.id !== followed?.id).map((p) => <Body key={p.id} player={p} colour={PALETTE[round.players.indexOf(p) % PALETTE.length]} />)}
    {shot && ray && round.elapsed - shot.at < 0.085 && <lineSegments><bufferGeometry><bufferAttribute attach="attributes-position" args={[new Float32Array([shot.x, shotHeight, shot.z, shot.x + ray.x * 22, shotHeight + ray.y * 22, shot.z + ray.z * 22]), 3]} /></bufferGeometry><lineBasicMaterial color="#fff4c2" transparent opacity={0.7} /></lineSegments>}
    <Camera round={round} />
  </>
}
