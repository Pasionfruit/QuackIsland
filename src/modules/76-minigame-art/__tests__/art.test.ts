import { describe, expect, it } from 'vitest'
import { Group, Mesh, PerspectiveCamera, Scene, type WebGLRenderer } from 'three'
import { ART_DIRECTIONS, createBeveledBox, createMinigameArt, disposeArt, type MinigameArtId } from '..'
import { ArtBatch } from '../internal/geometry'
import { PROP_KINDS, prop } from '../internal/props'

describe('procedural minigame art budgets and placement',()=>{
  for(const game of Object.keys(ART_DIRECTIONS) as MinigameArtId[])it(`${game}: finite, batched, outside play and reproducible`,()=>{
    const a=createMinigameArt(game),b=createMinigameArt(game)
    expect(a.children.length).toBeGreaterThan(0)
    expect(a.children.length).toBeLessThanOrEqual(3)
    expect(a.userData.art.triangles).toBeLessThanOrEqual(30000)
    expect(a.userData.art.parts).toBeGreaterThan(40)
    const {halfWidth:w,halfDepth:d}=a.userData.clearance
    a.children.forEach((object,index)=>{
      expect(object).toBeInstanceOf(Mesh)
      const mesh=object as Mesh,other=b.children[index] as Mesh
      const points=mesh.geometry.getAttribute('position')
      expect(points.array).toEqual(other.geometry.getAttribute('position').array)
      expect(mesh.geometry.getAttribute('color').array).toEqual(other.geometry.getAttribute('color').array)
      let finite=true,clear=true
      for(let i=0;i<points.count;i++){
        const x=points.getX(i),y=points.getY(i),z=points.getZ(i)
        finite&&=Number.isFinite(x+y+z)
        clear&&=Math.abs(x)>w||Math.abs(z)>d
      }
      expect(finite).toBe(true);expect(clear).toBe(true)
      let hits=0;mesh.raycast({} as never,{push:()=>hits++} as never);expect(hits).toBe(0)
    })
    disposeArt(a);disposeArt(b)
  })
  for(const kind of PROP_KINDS)it(`${kind}: each prop respects the 3,000-triangle asset budget`,()=>{
    const b=new ArtBatch();prop(b,kind,ART_DIRECTIONS['zombie-tag'].palette)
    expect(b.triangles).toBeGreaterThan(0);expect(b.triangles).toBeLessThanOrEqual(3000)
    const art=b.finish(kind);disposeArt(art)
  })
  it('accepts game-supplied layout bounds, elevation and smaller geometry',()=>{
    const a=createMinigameArt('messy-maze',{halfWidth:25.7,halfDepth:25.7,center:[1,3,-2],scale:.6})
    expect(a.position.toArray()).toEqual([1,3,-2])
    expect(a.userData.clearance).toEqual({halfWidth:25.7,halfDepth:25.7,center:[1,3,-2]})
    let disposed=0
    a.children.forEach(c=>(c as Mesh).geometry.addEventListener('dispose',()=>disposed++))
    disposeArt(a);expect(disposed).toBe(a.children.length)
  })
  it('rejects bad dimensions before allocating geometry',()=>{
    for(const layout of [{halfWidth:0},{halfDepth:-1},{scale:NaN},{center:[0,Infinity,0] as const}])expect(()=>createMinigameArt('zombie-tag',layout)).toThrow('Invalid art layout')
  })
  it('beveled assets retain their bounds and stay within the per-asset triangle budget',()=>{
    for(const dimensions of [[1,1,1],[80,.03,100],[.02,2,.02],[0,1,1],[-1,2,3]]){
      const [w,h,d]=dimensions,g=createBeveledBox(w,h,d);g.computeBoundingBox()
      const bounds=g.boundingBox!,size=bounds.max.clone().sub(bounds.min)
      expect(size.x).toBeCloseTo(Math.abs(w),5);expect(size.y).toBeCloseTo(h,5);expect(size.z).toBeCloseTo(d,5)
      expect((g.index?.count??g.getAttribute('position').count)/3).toBeLessThan(3000)
      expect(bounds.getCenter(size).length()).toBeLessThan(1e-5)
      g.dispose()
    }
  })
  it('endless-tower scenery stays visible as its camera rises without moving that camera',()=>{
    const art=createMinigameArt('highest-in-the-room',{followCameraHeight:true,center:[0,2,0]})
    const camera=new PerspectiveCamera();camera.position.set(4,120,18);camera.updateMatrixWorld()
    const scene=new Scene(),mesh=art.children[0] as Mesh,original=camera.matrixWorld.clone()
    expect(mesh.frustumCulled).toBe(false)
    mesh.onBeforeRender({} as WebGLRenderer,scene,camera,mesh.geometry,mesh.material as never,new Group())
    expect(art.position.y).toBe(118);expect(camera.matrixWorld.equals(original)).toBe(true)
    camera.position.y=240;camera.updateMatrixWorld()
    mesh.onBeforeRender({} as WebGLRenderer,scene,camera,mesh.geometry,mesh.material as never,new Group())
    expect(art.position.y).toBe(238)
    disposeArt(art)
  })
})
