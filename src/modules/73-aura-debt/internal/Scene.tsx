import { useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Plane, Raycaster, Vector2, Vector3 } from 'three'
import { PRIORITY } from '../../00-core'
import { clamp, lead, type Hands, type Round } from './rules'

export interface View { yaw: number; pitch: number }
const colours = { crate: '#ff9864', slick: '#9963ff', gust: '#66e5ed' }

function AimPlane({ hands }: { hands: Hands }) {
  const { camera, gl } = useThree()
  useEffect(() => {
    const ray = new Raycaster(), point = new Vector3(), plane = new Plane(new Vector3(0,1,0),0)
    const move = (e: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect()
      ray.setFromCamera(new Vector2((e.clientX-rect.left)/rect.width*2-1, -(e.clientY-rect.top)/rect.height*2+1),camera)
      if (ray.ray.intersectPlane(plane,point)) hands.aim=clamp(point.x,-4.9,4.9)
    }
    gl.domElement.addEventListener('pointermove',move)
    return () => gl.domElement.removeEventListener('pointermove',move)
  },[camera,gl,hands])
  return null
}

function Skateboard({ fallen }: { fallen: boolean }) {
  return <group rotation={[0, 0, fallen ? 1.25 : 0]}>
    <mesh position={[0, .27, 0]}><boxGeometry args={[.63,.13,1.6]}/><meshStandardMaterial color="#a8ff62"/></mesh>
    {[-.48,.48].flatMap(z => [-.36,.36].map(x => <mesh key={`${x}:${z}`} position={[x,.16,z]} rotation={[0,0,Math.PI/2]}>
      <cylinderGeometry args={[.15,.15,.13,8]}/><meshStandardMaterial color="#efecf5"/></mesh>))}
    <mesh position={[0,.77,-.1]} rotation={[0,0,-.12]}><boxGeometry args={[.65,.8,.5]}/><meshStandardMaterial color="#7b61ff"/></mesh>
    <mesh position={[0,1.4,-.1]}><sphereGeometry args={[.36,10,8]}/><meshStandardMaterial color="#ffe06e"/></mesh>
    <mesh position={[0,1.6,-.1]}><sphereGeometry args={[.37,10,6,0,Math.PI*2,0,Math.PI/2]}/><meshStandardMaterial color="#f8f4ff"/></mesh>
    <mesh position={[0,1.38,-.48]}><boxGeometry args={[.38,.12,.3]}/><meshStandardMaterial color="#ff9c35"/></mesh>
    {[-1,1].map(side => <group key={side}>
      <mesh position={[side*.26,.4,side*.3]}><boxGeometry args={[.2,.28,.28]}/><meshStandardMaterial color="#ffb94d"/></mesh>
      <mesh position={[side*.52,.99,-.1]} rotation={[0,0,side*.55]}><boxGeometry args={[.48,.18,.25]}/><meshStandardMaterial color="#ffe06e"/></mesh>
    </group>)}
  </group>
}

function Course({ round: r, rider, view, hands }: { round: Round; rider: boolean; view: View; hands: Hands }) {
  const cameraTarget = useRef(new Vector3())
  useFrame(({ camera }, dt) => {
    const target = cameraTarget.current
    if (rider) {
      target.set(r.x + Math.sin(view.yaw)*8, 4.8 + view.pitch*3, 8*Math.cos(view.yaw))
      camera.position.lerp(target, 1-Math.exp(-dt*9))
      camera.lookAt(r.x, .7, -7)
    } else {
      target.set(0, 21, 13)
      camera.position.lerp(target, 1-Math.exp(-dt*9))
      camera.lookAt(0, 0, -13)
    }
  }, PRIORITY.input)
  return <>
    <color attach="background" args={['#101426']}/>
    <fog attach="fog" args={['#101426',35,85]}/>
    <ambientLight intensity={1.35}/><directionalLight position={[4,12,3]} intensity={2.5}/>
    <mesh position={[0,-.23,-26]}><boxGeometry args={[12,.4,86]}/><meshStandardMaterial color="#303947" roughness={.95}/></mesh>
    {[-1,1].map(side => <group key={side}>
      <mesh position={[side*6.1,-.18,-26]}><boxGeometry args={[.2,.5,86]}/><meshStandardMaterial color="#a8ff62" emissive="#395a20"/></mesh>
      {Array.from({length:8},(_,i) => <mesh key={i} position={[side*9,1.5,-i*11+(r.distance%11)]}>
        <boxGeometry args={[2.4,3+(i%3)*2,3]}/><meshStandardMaterial color={i%2 ? '#202e43' : '#28344e'}/>
      </mesh>)}
    </group>)}
    {Array.from({length:14},(_,i) => <mesh key={i} position={[0,.005,5-i*5+(r.distance%5)]}>
      <boxGeometry args={[.1,.015,1.8]}/><meshStandardMaterial color="#adb7c2"/>
    </mesh>)}
    <group position={[r.x,0,0]} rotation={[0,-r.vx*.06,-r.balance*.4]}><Skateboard fallen={r.over && r.winner === 'trappers'}/></group>
    {r.hazards.map(h => <group key={h.id} position={[h.x,0,r.distance-h.at]}>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,.025,0]}>
        <ringGeometry args={[h.kind==='gust'?1.5:.85,h.kind==='gust'?1.7:1,20]}/>
        <meshBasicMaterial color={colours[h.kind]} transparent opacity={h.hit?.18:.85}/>
      </mesh>
      {!h.hit && (h.kind==='crate' ? <mesh position={[0,h.warning>0?.2:.55,0]}>
        <boxGeometry args={[1.3,h.warning>0?.35:1.1,1.1]}/><meshStandardMaterial color={colours.crate} transparent opacity={h.warning>0?.4:1}/>
      </mesh> : h.kind==='slick' ? <mesh position={[0,.04,0]} rotation={[-Math.PI/2,0,0]}>
        <circleGeometry args={[1.1,16]}/><meshStandardMaterial color={colours.slick} metalness={.7} roughness={.2} transparent opacity={h.warning>0?.35:.95}/>
      </mesh> : <group>{[0,1,2].map(i=><mesh key={i} position={[0,.35+i*.4,0]} rotation={[0,0,-.2]}>
        <boxGeometry args={[3.3,.1,.4]}/><meshStandardMaterial color={colours.gust} emissive="#28747d" transparent opacity={h.warning>0?.3:.85}/>
      </mesh>)}</group>)}
      {h.warning>0 && <mesh position={[0,2.3,0]}><octahedronGeometry args={[.22,0]}/><meshBasicMaterial color={colours[h.kind]}/></mesh>}
    </group>)}
    {!rider && !r.over && <mesh position={[hands.aim,.055,-lead(r)]} rotation={[-Math.PI/2,0,0]}>
      <ringGeometry args={[.8,1,24]}/><meshBasicMaterial color="#ffffff"/>
    </mesh>}
  </>
}

export function AuraScene(props: { round: Round; rider: boolean; view: View; hands: Hands }) {
  return <Canvas dpr={[1,1.5]} camera={{position:[0,7,11],fov:58,near:.1,far:120}} gl={{antialias:true}}>
    <Course {...props}/>
    {!props.rider && <AimPlane hands={props.hands}/>}
  </Canvas>
}
