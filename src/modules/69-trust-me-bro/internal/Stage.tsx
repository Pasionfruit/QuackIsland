import { useEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { OrthographicCamera, type Group } from 'three'
import { getCameraMode, setCameraMode, PRIORITY, useGameFrame } from '../../00-core'
import { createAvatar } from '../../02-player'
import { COLOURS, doors, REVEAL_SECONDS, type Round } from './rules'

export const doorX = (index: number, count: number) => (index - (count - 1) / 2) * 2.7

function Hatch({ round, index, point }: { round: Round; index: number; point: (door: number) => void }) {
  const hinge = useRef<Group>(null)
  const result = round.history[round.stage]
  const reveal = round.phase !== 'choose'
  const open = reveal && result?.pick === index && !result.ok
  const safe = reveal && result?.safe === index
  const selected = round.selected === index
  useGameFrame(() => {
    if (hinge.current) hinge.current.rotation.x += ((open ? 1.45 : 0) - hinge.current.rotation.x) * 0.16
  }, PRIORITY.world)
  return <group position={[doorX(index, doors(round)), 0, 0]}>
    <mesh position={[0, -0.4, 0]}><boxGeometry args={[2.4, 0.75, 3.8]} /><meshStandardMaterial color="#122c39" /></mesh>
    <mesh position={[0, -0.005, 0]}><boxGeometry args={[2.38, 0.08, 3.78]} /><meshStandardMaterial color={safe ? '#93dba2' : selected ? '#f3cc70' : '#e0c6a1'} /></mesh>
    <group ref={hinge} position={[0, 0.08, -1.65]}>
      <mesh position={[0, 0, 1.65]} onPointerMove={(event) => { event.stopPropagation(); point(index) }} onClick={(event) => { event.stopPropagation(); point(index) }}>
        <boxGeometry args={[2.08, 0.16, 3.3]} /><meshStandardMaterial color={safe ? '#61b583' : '#a47950'} roughness={0.9} />
      </mesh>
      {[-0.63, 0, 0.63].map((x) => <mesh key={x} position={[x, 0.086, 1.65]}><boxGeometry args={[0.022, 0.01, 3.15]} /><meshStandardMaterial color="#805d40" /></mesh>)}
      {[0.35, 2.95].map((z) => <mesh key={z} position={[0, 0.12, z]}><boxGeometry args={[1.93, 0.08, 0.18]} /><meshStandardMaterial color="#c79c65" /></mesh>)}
    </group>
  </group>
}

function Duck({ round }: { round: Round }) {
  const body = useRef<Group>(null)
  const avatar=useMemo(()=>createAvatar('#f7d56c'),[])
  useGameFrame((_state, dt) => {
    const g = body.current
    if (!g) return
    const result = round.history[round.stage]
    const falling = round.phase !== 'choose' && result && !result.ok
    const targetX = doorX(round.selected, doors(round))
    g.position.x += (targetX - g.position.x) * Math.min(1, dt * 14)
    g.position.z = round.phase === 'choose' ? 2.6 : 0
    g.position.y = falling ? 0.7 - Math.min(4, round.phaseTime * 3) : 0.7
    g.rotation.z = falling ? Math.min(0.7, round.phaseTime) : Math.sin(round.elapsed * 3) * 0.025
  }, PRIORITY.world)
  return <group ref={body} position={[0, 0.7, 2.6]}>
    <group position={[0,-.66,0]} rotation={[0,Math.PI,0]} scale={.8}><primitive object={avatar}/></group>
  </group>
}

function Adviser({colour}:{colour:string}) {
  const avatar=useMemo(()=>createAvatar(colour),[colour])
  return <group position={[0,-.6,0]} scale={.6}><primitive object={avatar}/></group>
}

export function Stage({ round, advance, point }: { round: Round; advance: (dt: number) => void; point: (door: number) => void }) {
  const { size, get, set } = useThree()
  const camera=useMemo(()=>new OrthographicCamera(-1,1,1,-1,.1,100),[])
  useEffect(()=>{
    const previousCamera=get().camera,previousMode=getCameraMode()
    camera.position.set(0,11,13);camera.lookAt(0,0,0)
    setCameraMode('player');set({camera})
    return ()=>{set({camera:previousCamera});setCameraMode(previousMode)}
  },[camera,get,set])
  useEffect(() => {
    camera.left=-size.width/2;camera.right=size.width/2;camera.top=size.height/2;camera.bottom=-size.height/2
    camera.zoom = Math.min(size.width / 18.5, size.height / 13)
    camera.updateProjectionMatrix()
  }, [camera, size.width, size.height])
  useGameFrame((_state, dt) => advance(Math.min(dt, 0.05)), PRIORITY.simulation)
  return <>
    <color attach="background" args={['#c4dce3']} />
    <mesh position={[0, -0.75, 0]}><boxGeometry args={[18, 0.6, 10]} /><meshStandardMaterial color="#769da3" /></mesh>
    <mesh position={[0, -0.18, 3.9]}><boxGeometry args={[17, 0.3, 3]} /><meshStandardMaterial color="#ecdfc4" /></mesh>
    <mesh position={[0, -0.18, -3.7]}><boxGeometry args={[17, 0.3, 3]} /><meshStandardMaterial color="#ecdfc4" /></mesh>
    {[-8.1, 8.1].map((x) => <mesh key={x} position={[x, -0.17, 0]}><boxGeometry args={[0.8, 0.3, 6]} /><meshStandardMaterial color="#ecdfc4" /></mesh>)}
    {[-7.7, -3.8, 0, 3.8, 7.7].map((x) => <mesh key={x} position={[x, 0.65, -4.8]}><boxGeometry args={[0.13, 1.55, 0.13]} /><meshStandardMaterial color="#56828b" /></mesh>)}
    <mesh position={[0, 1.1, -4.8]}><boxGeometry args={[15.5, 0.13, 0.13]} /><meshStandardMaterial color="#56828b" /></mesh>
    {Array.from({ length: doors(round) }, (_, i) => <Hatch key={`${round.stage}:${i}`} round={round} index={i} point={point} />)}
    {round.players.filter((p) => p.role === 'adviser' && !p.left).map((p, i, list) => <group key={p.id} position={[(i - (list.length - 1) / 2) * 1.4, 0.6, -3.6]}>
      <Adviser colour={COLOURS[(i + 1) % COLOURS.length]}/>
    </group>)}
    <Duck round={round} />
  </>
}

export function revealProgress(round: Round): number { return Math.min(1, round.phaseTime / REVEAL_SECONDS) }
