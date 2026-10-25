import { Box3, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { TIDE_MAX } from '../../00-core'
import { sampleAt } from '../../01-terrain'
import { getSolidRocks } from '../../12-rocks'
import { coconutGeometry, grassGeometry, palmGeometry } from '../internal/geometry'
import { islandFloraField, plantingMatrix } from '../internal/IslandFlora'
import { FLORA, scatterFlora } from '../internal/scatter'

const flat=(x:number,z:number)=>({height:3+x*.01+z*.005,slope:.02,normalX:-.01,normalY:1,normalZ:-.005})
const all=(field:ReturnType<typeof scatterFlora>)=>[...field.palms,...field.grass,...field.coconuts]

describe('island flora placement',()=>{
  it('repeats the same layout for a world seed and changes it for another seed',()=>{
    const options={radius:140,palms:20,grass:60,coconuts:30}
    const first=scatterFlora(flat,options,1337)
    expect(scatterFlora(flat,options,1337)).toEqual(first)
    expect(scatterFlora(flat,options,1338)).not.toEqual(first)
    expect(first.palms).toHaveLength(20);expect(first.grass).toHaveLength(60);expect(first.coconuts).toHaveLength(30)
  })
  it('honours spawn clearance, protected rocks, palm spacing and ground height',()=>{
    const obstacle={x:20,z:20,radius:8}
    const field=scatterFlora(flat,{radius:110,occupied:[obstacle],palms:24,grass:80,coconuts:40})
    for(const p of all(field)){
      expect(Math.hypot(p.x,p.z)).toBeGreaterThan(FLORA.spawnClear)
      expect(Math.hypot(p.x-obstacle.x,p.z-obstacle.z)).toBeGreaterThan(obstacle.radius)
      expect(p.y).toBeCloseTo(flat(p.x,p.z).height,1)
      expect(Math.hypot(p.x,p.z)).toBeLessThanOrEqual(110)
    }
    for(let i=0;i<field.palms.length;i++)for(let j=i+1;j<field.palms.length;j++){
      expect(Math.hypot(field.palms[i].x-field.palms[j].x,field.palms[i].z-field.palms[j].z)).toBeGreaterThanOrEqual(FLORA.palmSpacing)
    }
  })
  it('terminates without planting underwater or on steep/invalid terrain',()=>{
    const options={radius:30,palms:3,grass:3,coconuts:3}
    for(const bad of [{height:0,slope:0},{height:5,slope:1},{height:NaN,slope:0}]){
      const field=scatterFlora(()=>({...flat(0,0),...bad}),options)
      expect(all(field)).toHaveLength(0)
    }
  })
  it('populates the real island above high water and outside existing rocks',()=>{
    const field=islandFloraField(), rocks=getSolidRocks()
    expect(field.palms).toHaveLength(FLORA.palms)
    expect(field.grass).toHaveLength(FLORA.grass)
    expect(field.coconuts).toHaveLength(FLORA.coconuts)
    for(const p of all(field)){
      expect(sampleAt(p.x,p.z).height).toBeGreaterThanOrEqual(TIDE_MAX+.5)
      for(const rock of rocks)expect(Math.hypot(p.x-rock.x,p.z-rock.z)).toBeGreaterThan(rock.girth)
    }
  })
})

describe('procedural flora geometry',()=>{
  it('keeps each model below 3000 triangles, finite, coloured, and resting at zero',()=>{
    for(const geometry of [palmGeometry(),grassGeometry(),coconutGeometry()]){
      const position=geometry.getAttribute('position')
      expect((geometry.index?.count??position.count)/3).toBeLessThan(3000)
      expect(Array.from(position.array).every(Number.isFinite)).toBe(true)
      expect(Array.from(geometry.getAttribute('normal').array).every(Number.isFinite)).toBe(true)
      expect(geometry.getAttribute('color').count).toBe(position.count)
      expect(geometry.boundingBox!.min.y).toBeCloseTo(0,6)
      geometry.dispose()
    }
  })
  it('keeps the entire field within its triangle allocation',()=>{
    const geometry=[palmGeometry(),grassGeometry(),coconutGeometry()]
    const counts=[FLORA.palms,FLORA.grass,FLORA.coconuts]
    const total=geometry.reduce((sum,g,i)=>sum+(g.index?.count??g.getAttribute('position').count)/3*counts[i],0)
    expect(total).toBeLessThan(100000)
    geometry.forEach(g=>g.dispose())
  })
  it('aligns an instance to the surface normal while retaining its ground origin',()=>{
    const plant=scatterFlora(flat,{radius:80,palms:1,grass:0,coconuts:0}).palms[0]
    const matrix=plantingMatrix(plant)
    expect(new Vector3().applyMatrix4(matrix).distanceTo(new Vector3(plant.x,plant.y,plant.z))).toBeLessThan(1e-8)
    const up=new Vector3(0,1,0).transformDirection(matrix)
    expect(up.distanceTo(new Vector3(plant.nx,plant.ny,plant.nz).normalize())).toBeLessThan(1e-8)
    const size=new Box3().copy(palmGeometry().boundingBox!).getSize(new Vector3())
    expect(size.y).toBeGreaterThan(7)
    expect(size.x).toBeGreaterThan(7)
  })
})
