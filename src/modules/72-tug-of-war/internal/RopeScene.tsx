import { useEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Group, InstancedMesh, Object3D, PerspectiveCamera } from 'three'
import { getCameraMode, PRIORITY, setCameraMode, useGameFrame } from '../../00-core'
import { activeTeam, PALETTE, type Player, type Round } from './rules'

function Puller({ round, player, index }: { round: Round; player: Player; index: number }) {
  const group = useRef<Group>(null)
  useGameFrame(() => {
    if (!group.current) return
    const solo = player.role === 'solo', pulse = Math.max(0, 1 - (round.elapsed-player.lastAt)/.2)
    group.current.position.set((solo ? -5 : 4+index*.85)+round.pull*3, .03, solo ? 0 : (index%2)*.18)
    group.current.rotation.set(0, solo ? -Math.PI/2 : Math.PI/2, (solo ? 1 : -1)*(.08+pulse*.12))
  }, PRIORITY.world)
  const colour = player.role === 'solo' ? PALETTE[0] : PALETTE[(index%(PALETTE.length-1))+1]
  return <group ref={group}>
    <mesh position={[0,.4,0]}><sphereGeometry args={[.36,10,7]}/><meshStandardMaterial color={colour}/></mesh>
    <mesh position={[0,.87,-.03]}><sphereGeometry args={[.25,10,7]}/><meshStandardMaterial color={colour}/></mesh>
    <mesh position={[0,.83,-.31]}><boxGeometry args={[.24,.1,.23]}/><meshStandardMaterial color="#da9d68"/></mesh>
    {[-.1,.1].map((x)=><mesh key={x} position={[x,.95,-.25]}><sphereGeometry args={[.025,5,4]}/><meshStandardMaterial color="#344c50"/></mesh>)}
    {[-.18,.18].map((x)=><mesh key={x} position={[x,.035,-.06]}><boxGeometry args={[.17,.07,.3]}/><meshStandardMaterial color="#d99d66"/></mesh>)}
    {player.mine&&<mesh rotation={[-Math.PI/2,0,0]} position={[0,.014,0]}><ringGeometry args={[.45,.55,20]}/><meshBasicMaterial color="#fff7d3"/></mesh>}
  </group>
}
function Rope({ round }: { round: Round }) {
  const group = useRef<Group>(null), twists=useRef<InstancedMesh>(null), transform=useMemo(()=>new Object3D(),[])
  const end = 4 + Math.max(0,activeTeam(round).length-1)*.85 + .4
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
    <mesh position={[0,.49,0]} rotation={[0,0,.08]}><boxGeometry args={[.19,.48,.025]}/><meshStandardMaterial color="#d98676"/></mesh>
    <mesh position={[0,.76,0]}><sphereGeometry args={[.075,8,5]}/><meshStandardMaterial color="#f2d2a1"/></mesh>
  </group>
}
function Camera(){
  const {camera,size}=useThree()
  useEffect(()=>{const old=getCameraMode();setCameraMode('player');const p=camera as PerspectiveCamera;p.fov=45;p.near=.08;p.far=100;p.updateProjectionMatrix();return()=>setCameraMode(old)},[camera])
  useGameFrame(()=>{
    const distance=Math.max(15,28/(2*Math.tan(Math.PI/8)*(size.width/size.height)))
    camera.position.set(0,distance*.52,distance*.85);camera.lookAt(0,.5,0)
  },PRIORITY.camera)
  return null
}
export function RopeScene({round,advance}:{round:Round;advance:(dt:number)=>void}){
  const solo=round.players.find((p)=>p.role==='solo'&&!p.left),team=activeTeam(round)
  useGameFrame((_state,dt)=>advance(Math.min(dt,.05)),PRIORITY.simulation)
  return <>
    <mesh position={[0,-.24,0]}><cylinderGeometry args={[15,15,.48,48]}/><meshStandardMaterial color="#e3dec8"/></mesh>
    {[-1,1].map((side)=><group key={side}>
      <mesh position={[side*6,.015,0]} rotation={[-Math.PI/2,0,0]}><circleGeometry args={[3.2,32]}/><meshBasicMaterial color={side<0?'#dfc29b':'#a9c6bd'}/></mesh>
      <mesh position={[side*3,.025,0]}><boxGeometry args={[.09,.03,6]}/><meshBasicMaterial color={side<0?'#d6a875':'#81a9a3'}/></mesh>
      <mesh position={[side*9.5,1.4,-4]}><cylinderGeometry args={[.055,.055,2.8,5]}/><meshStandardMaterial color="#a79a7a"/></mesh>
      <mesh position={[side*9.5+.5,2.35,-4]}><boxGeometry args={[1,.6,.045]}/><meshStandardMaterial color={side<0?'#ddb37b':'#8ab8b0'}/></mesh>
    </group>)}
    <mesh position={[0,.018,0]}><boxGeometry args={[.045,.02,6]}/><meshBasicMaterial color="#fff8dc"/></mesh>
    {[0,1,2].map((i)=><mesh key={i} position={[0,.22+i*.32,-5.5-i*.6]}><boxGeometry args={[15,.44,.7]}/><meshStandardMaterial color={i%2?'#b5c6b8':'#c7d0bd'}/></mesh>)}
    {solo&&<Puller round={round} player={solo} index={0}/>}
    {team.map((p,i)=><Puller key={p.id} round={round} player={p} index={i}/>)}
    <Rope round={round}/><Camera/>
  </>
}
