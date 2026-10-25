import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { getSolidRocks } from '../../12-rocks'
import { ATLAS_RECTS, ATLAS_SIZE } from '../internal/atlas'
import { casinoGeometry } from '../internal/geometry'
import { getCasinoStations } from '../internal/LobbyCasino'
import { CASINO_KINDS, layoutCasino, stationMatrix } from '../internal/layout'
import { casinoOverlayGeometry } from '../internal/overlays'

const flat=()=>({height:3,slope:0,normalX:0,normalY:1,normalZ:0})

describe('central lobby casino props',()=>{
  it('places all five requested stations on the real island, outside the spawn and rocks',()=>{
    const stations=getCasinoStations(),rocks=getSolidRocks()
    expect(stations.map(p=>p.kind)).toEqual([...CASINO_KINDS])
    for(const p of stations){
      expect(Math.hypot(p.x,p.z)).toBeGreaterThan(7-1e-8)
      expect(Math.hypot(p.x,p.z)).toBeLessThan(10)
      const front=new Vector3(0,0,1).transformDirection(stationMatrix(p))
      expect(front.x*(-p.x)+front.z*(-p.z)).toBeGreaterThan(5)
      for(const rock of rocks)expect(Math.hypot(p.x-rock.x,p.z-rock.z)).toBeGreaterThan(rock.girth+(p.kind==='slots'?1.5:2.6))
    }
    for(let i=0;i<stations.length;i++)for(let j=i+1;j<stations.length;j++){
      expect(Math.hypot(stations[i].x-stations[j].x,stations[i].z-stations[j].z)).toBeGreaterThanOrEqual(5.8)
    }
  })
  it('uses deterministic layouts and rejects submerged or invalid ground',()=>{
    expect(layoutCasino(flat)).toEqual(layoutCasino(flat))
    expect(layoutCasino(()=>({...flat(),height:-2}))).toEqual([])
    expect(layoutCasino(()=>({...flat(),normalY:NaN}))).toEqual([])
  })
  it('keeps every procedural fixture finite, coloured and below its asset triangle budget',()=>{
    let total=0
    for(const kind of CASINO_KINDS){
      const geometry=casinoGeometry(kind),positions=geometry.getAttribute('position')
      const triangles=(geometry.index?.count??positions.count)/3
      expect(triangles).toBeLessThan(3000);total+=triangles
      expect(Array.from(positions.array).every(Number.isFinite)).toBe(true)
      expect(geometry.getAttribute('color').count).toBe(positions.count)
      expect(geometry.boundingBox!.min.y).toBeGreaterThanOrEqual(-.0001)
      expect(geometry.boundingBox!.max.y).toBeGreaterThan(1)
      geometry.dispose()
    }
    expect(total).toBeLessThan(18000)
  })
  it('keeps the slot cabinet tall enough for five visible reel columns',()=>{
    const geometry=casinoGeometry('slots'),size=geometry.boundingBox!.getSize(new Vector3())
    expect(size.y).toBeGreaterThan(2.2)
    expect(size.x).toBeGreaterThan(1.8)
    geometry.dispose()
  })
  it('fits all procedural graphics within a single 1024-pixel texture',()=>{
    for(const [x,y,w,h]of ATLAS_RECTS){
      expect(x).toBeGreaterThanOrEqual(0);expect(y).toBeGreaterThanOrEqual(0)
      expect(x+w).toBeLessThanOrEqual(ATLAS_SIZE);expect(y+h).toBeLessThanOrEqual(ATLAS_SIZE)
    }
    const geometry=casinoOverlayGeometry(layoutCasino(flat)),uv=geometry.getAttribute('uv')
    expect(geometry.getAttribute('position').count).toBeGreaterThan(20)
    for(let i=0;i<uv.count;i++){
      expect(uv.getX(i)).toBeGreaterThanOrEqual(0);expect(uv.getX(i)).toBeLessThanOrEqual(1)
      expect(uv.getY(i)).toBeGreaterThanOrEqual(0);expect(uv.getY(i)).toBeLessThanOrEqual(1)
    }
    geometry.dispose()
  })
})
