import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Color, DoubleSide, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three'
import { sampleAt, TERRAIN } from '../../01-terrain'
import { useParty } from '../../10-party'
import { getSolidRocks } from '../../12-rocks'
import { useMinigameScreen } from '../../15-minigames'
import { coconutGeometry, grassGeometry, palmGeometry } from './geometry'
import { scatterFlora, type Planting } from './scatter'
import { scatterOasis } from './oasis'
import { flowerGeometry, retreatGeometry, steppingStoneGeometry } from './oasisGeometry'

export function islandFloraField() {
  return scatterFlora(sampleAt, { radius: TERRAIN.islandRadius,
    occupied: getSolidRocks().map(rock=>({x:rock.x,z:rock.z,radius:rock.girth+.4})) })
}

export function islandOasisField(flora=islandFloraField()) {
  return scatterOasis(sampleAt,flora,{radius:TERRAIN.islandRadius,
    occupied:getSolidRocks().map(rock=>({x:rock.x,z:rock.z,radius:rock.girth+.4}))})
}

/** Stable, normal-aligned matrices; no per-frame instance updates. */
export function plantingMatrix(p: Planting): Matrix4 {
  const up = new Vector3(0,1,0)
  const align = new Quaternion().setFromUnitVectors(up,new Vector3(p.nx,p.ny,p.nz).normalize())
  align.multiply(new Quaternion().setFromAxisAngle(up,p.yaw))
  return new Matrix4().compose(new Vector3(p.x,p.y,p.z),align,new Vector3(p.scale,p.scale,p.scale))
}

export function IslandFlora() {
  const palms=useRef<InstancedMesh>(null), grass=useRef<InstancedMesh>(null), coconuts=useRef<InstancedMesh>(null)
  const nooks=useRef<InstancedMesh>(null),flowers=useRef<InstancedMesh>(null),stones=useRef<InstancedMesh>(null)
  const field=useMemo(()=>{
    const flora=islandFloraField(),oasis=islandOasisField(flora)
    const clear=(p:Planting)=>oasis.nooks.every(n=>Math.hypot(n.x-p.x,n.z-p.z)>4)
    return {...flora,...oasis,grass:flora.grass.filter(clear),coconuts:flora.coconuts.filter(clear)}
  },[])
  const geometry=useMemo(()=>({palm:palmGeometry(),grass:grassGeometry(),coconut:coconutGeometry(),
    retreat:retreatGeometry(),flower:flowerGeometry(),stone:steppingStoneGeometry()}),[])
  const material=useMemo(()=>new MeshStandardMaterial({vertexColors:true,flatShading:true,side:DoubleSide,roughness:.95}),[])
  const party=useParty(), screen=useMinigameScreen()
  useLayoutEffect(()=>{
    const fill=(mesh: InstancedMesh|null, plants: Planting[])=>{
      if(!mesh)return
      plants.forEach((plant,i)=>{
        mesh.setMatrixAt(i,plantingMatrix(plant))
        const shade=.84+(i%7)/6*.16
        mesh.setColorAt(i,new Color(shade,shade,shade))
      })
      mesh.instanceMatrix.needsUpdate=true
      if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true
      mesh.computeBoundingBox();mesh.computeBoundingSphere()
    }
    fill(palms.current,field.palms);fill(grass.current,field.grass);fill(coconuts.current,field.coconuts)
    fill(nooks.current,field.nooks);fill(flowers.current,field.flowers);fill(stones.current,field.stones)
  },[field])
  useEffect(()=>()=>{
    Object.values(geometry).forEach(g=>g.dispose());material.dispose()
  },[geometry,material])
  return <group name="island-flora" visible={party.phase!=='playing' && screen.at!=='game'} dispose={null}>
    <instancedMesh ref={palms} name="island-palms" args={[geometry.palm,material,field.palms.length]} castShadow receiveShadow/>
    <instancedMesh ref={grass} name="island-grass" args={[geometry.grass,material,field.grass.length]} receiveShadow/>
    <instancedMesh ref={coconuts} name="island-coconuts" args={[geometry.coconut,material,field.coconuts.length]} castShadow receiveShadow/>
    <instancedMesh ref={nooks} name="oasis-retreats" args={[geometry.retreat,material,field.nooks.length]} castShadow receiveShadow/>
    <instancedMesh ref={flowers} name="oasis-flowers" args={[geometry.flower,material,field.flowers.length]} receiveShadow/>
    <instancedMesh ref={stones} name="oasis-stones" args={[geometry.stone,material,field.stones.length]} receiveShadow/>
    {field.nooks.map((p,i)=><pointLight key={i} position={[p.x,p.y+2.4,p.z]} color="#ffd4a0" intensity={8} distance={9} decay={2}/>)}
  </group>
}
