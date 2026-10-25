import { MinigameArt, BeveledBox } from '../../76-minigame-art'
import { useEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Group, InstancedMesh, Object3D, PerspectiveCamera } from 'three'
import { getCameraMode, PRIORITY, setCameraMode, useGameFrame } from '../../00-core'
import { activeTeam, PALETTE, type Player, type Round } from './rules'
import { DuckModel } from './DuckModel'

const TEAM_SPACING = 1.3

function Puller({ round, player, index }: { round: Round; player: Player; index: number }) {
  const group = useRef<Group>(null)
  useGameFrame(() => {
    if (!group.current) return
    const solo = player.role === 'solo', pulse = Math.max(0, 1 - (round.elapsed-player.lastAt)/.2)
    group.current.position.set((solo ? -5 : 4+index*TEAM_SPACING)+round.pull*3, .03, solo ? 0 : (index%2)*.18)
    group.current.rotation.set(0, solo ? -Math.PI/2 : Math.PI/2, (solo ? 1 : -1)*(.08+pulse*.12))
  }, PRIORITY.world)
  const colour = player.role === 'solo' ? PALETTE[0] : PALETTE[(index%(PALETTE.length-1))+1]
  return <group ref={group}>
    <DuckModel colour={colour}/>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,.009,.08]} scale={[.55,.72,1]}><circleGeometry args={[1,18]}/><meshBasicMaterial color="#756d51" transparent opacity={.17} depthWrite={false}/></mesh>
    {player.mine&&<mesh rotation={[-Math.PI/2,0,0]} position={[0,.014,0]}><ringGeometry args={[.59,.68,24]}/><meshBasicMaterial color="#fff7d3"/></mesh>}
  </group>
}
function Rope({ round }: { round: Round }) {
  const group = useRef<Group>(null), twists=useRef<InstancedMesh>(null), transform=useMemo(()=>new Object3D(),[])
  const end = 4 + Math.max(0,activeTeam(round).length-1)*TEAM_SPACING + .4
  const length = end+5
  useEffect(()=>{
    for(let i=0;i<48;i++){
      transform.position.set(-5+(i+.5)/48*length,.67,0)
      transform.rotation.set(0,Math.PI/2,i*.7)
      transform.scale.set(1,1,1);transform.updateMatrix();twists.current?.setMatrixAt(i,transform.matrix)
    }
    if(twists.current)twists.current.instanceMatrix.needsUpdate=true
  },[length,transform])
  useGameFrame(()=>{if(group.current)group.current.position.x=round.pull*3},PRIORITY.world)
  return <group ref={group}>
    <mesh position={[(end-5)/2,.67,0]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.045,.045,length,7]}/><meshStandardMaterial color="#b79a67"/></mesh>
    <instancedMesh ref={twists} args={[undefined,undefined,48]}><torusGeometry args={[.046,.009,3,6]}/><meshStandardMaterial color="#d9be87"/></instancedMesh>
    <mesh position={[0,.49,0]} rotation={[0,0,.08]}><BeveledBox args={[.19,.48,.025]}/><meshStandardMaterial color="#d98676"/></mesh>
    <mesh position={[0,.76,0]}><sphereGeometry args={[.075,8,5]}/><meshStandardMaterial color="#f2d2a1"/></mesh>
  </group>
}
function Camera({teamSize}:{teamSize:number}){
  const {camera,size}=useThree()
  const lastDuck = 4+Math.max(0,teamSize-1)*TEAM_SPACING
  const centre = (lastDuck-5)/2
  const width = Math.max(25,lastDuck+13.4)
  useEffect(()=>{const old=getCameraMode();setCameraMode('player');const p=camera as PerspectiveCamera;p.fov=45;p.near=.08;p.far=100;p.updateProjectionMatrix();return()=>setCameraMode(old)},[camera])
  useGameFrame(()=>{
    const distance=Math.max(15,width/(2*Math.tan(Math.PI/8)*(size.width/size.height)))
    camera.position.set(centre,distance*.52,distance*.85);camera.lookAt(centre,.5,0)
  },PRIORITY.camera)
  return null
}
export function RopeScene({round,advance}:{round:Round;advance:(dt:number)=>void}){
  const solo=round.players.find((p)=>p.role==='solo'&&!p.left),team=activeTeam(round)
  useGameFrame((_state,dt)=>advance(Math.min(dt,.05)),PRIORITY.simulation)
  return <>
      <MinigameArt game="tug-of-war" halfWidth={15} halfDepth={15}/>
    <mesh position={[0,-.24,0]}><cylinderGeometry args={[15,15,.48,48]}/><meshStandardMaterial color="#e3dec8"/></mesh>
    {[-1,1].map((side)=><group key={side}>
      <mesh position={[side*6,.015,0]} rotation={[-Math.PI/2,0,0]}><circleGeometry args={[3.2,32]}/><meshBasicMaterial color={side<0?'#dfc29b':'#a9c6bd'}/></mesh>
      <mesh position={[side*3,.025,0]}><BeveledBox args={[.09,.03,6]}/><meshBasicMaterial color={side<0?'#d6a875':'#81a9a3'}/></mesh>
      <mesh position={[side*9.5,1.4,-4]}><cylinderGeometry args={[.055,.055,2.8,5]}/><meshStandardMaterial color="#a79a7a"/></mesh>
      <mesh position={[side*9.5+.5,2.35,-4]}><BeveledBox args={[1,.6,.045]}/><meshStandardMaterial color={side<0?'#ddb37b':'#8ab8b0'}/></mesh>
    </group>)}
    <mesh position={[0,.018,0]}><BeveledBox args={[.045,.02,6]}/><meshBasicMaterial color="#fff8dc"/></mesh>
    {[0,1,2].map((i)=><mesh key={i} position={[0,.22+i*.32,-5.5-i*.6]}><BeveledBox args={[15,.44,.7]}/><meshStandardMaterial color={i%2?'#b5c6b8':'#c7d0bd'}/></mesh>)}
    {solo&&<Puller round={round} player={solo} index={0}/>}
    {team.map((p,i)=><Puller key={p.id} round={round} player={p} index={i}/>)}
    <Rope round={round}/><Camera teamSize={team.length}/>
  </>
}
