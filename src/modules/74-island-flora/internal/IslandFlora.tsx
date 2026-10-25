import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Color, DoubleSide, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three'
import { sampleAt, TERRAIN } from '../../01-terrain'
import { useParty } from '../../10-party'
import { getSolidRocks } from '../../12-rocks'
import { useMinigameScreen } from '../../15-minigames'
import { coconutGeometry, grassGeometry, palmGeometry } from './geometry'
import { scatterFlora, type Planting } from './scatter'

export function islandFloraField() {
  return scatterFlora(sampleAt, { radius: TERRAIN.islandRadius,
    occupied: getSolidRocks().map(rock=>({x:rock.x,z:rock.z,radius:rock.girth+.4})) })
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
  const field=useMemo(islandFloraField,[])
  const geometry=useMemo(()=>({palm:palmGeometry(),grass:grassGeometry(),coconut:coconutGeometry()}),[])
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
  },[field])
  useEffect(()=>()=>{
    geometry.palm.dispose();geometry.grass.dispose();geometry.coconut.dispose();material.dispose()
  },[geometry,material])
  return <group name="island-flora" visible={party.phase!=='playing' && screen.at!=='game'} dispose={null}>
    <instancedMesh ref={palms} name="island-palms" args={[geometry.palm,material,field.palms.length]} castShadow receiveShadow/>
    <instancedMesh ref={grass} name="island-grass" args={[geometry.grass,material,field.grass.length]} receiveShadow/>
    <instancedMesh ref={coconuts} name="island-coconuts" args={[geometry.coconut,material,field.coconuts.length]} castShadow receiveShadow/>
  </group>
}
