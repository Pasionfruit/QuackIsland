import { describe, expect, it } from 'vitest'
import { islandFloraField, islandOasisField } from '../internal/IslandFlora'
import { flowerGeometry, retreatGeometry, steppingStoneGeometry } from '../internal/oasisGeometry'
import { coconutGeometry, grassGeometry, palmGeometry } from '../internal/geometry'
import { OASIS, scatterOasis } from '../internal/oasis'

describe('private oasis additions',()=>{
  it('places three separated retreats, flowering shrubs, and paths on the real island',()=>{
    const flora=islandFloraField(),oasis=islandOasisField(flora)
    expect(oasis.nooks).toHaveLength(OASIS.nooks)
    expect(oasis.flowers).toHaveLength(OASIS.flowers)
    expect(oasis.stones.length).toBeGreaterThan(10)
    for(let i=0;i<oasis.nooks.length;i++)for(let j=i+1;j<oasis.nooks.length;j++){
      expect(Math.hypot(oasis.nooks[i].x-oasis.nooks[j].x,oasis.nooks[i].z-oasis.nooks[j].z)).toBeGreaterThanOrEqual(24)
    }
    expect(islandOasisField(flora)).toEqual(oasis)
  })
  it('terminates gracefully on submerged terrain',()=>{
    const result=scatterOasis(()=>({height:-1,slope:0,normalX:0,normalY:1,normalZ:0}),{palms:[],grass:[],coconuts:[]},{radius:80,occupied:[]})
    expect(result).toEqual({nooks:[],flowers:[],stones:[]})
  })
  it('uses finite, coloured models below the per-asset and total scene budgets',()=>{
    const geometry=[palmGeometry(),grassGeometry(),coconutGeometry(),retreatGeometry(),flowerGeometry(),steppingStoneGeometry()]
    const oasis=islandOasisField(),counts=[72,420,120,3,32,oasis.stones.length]
    let total=0
    geometry.forEach((g,i)=>{
      const position=g.getAttribute('position'),triangles=(g.index?.count??position.count)/3
      expect(triangles).toBeLessThan(3000)
      expect(Array.from(position.array).every(Number.isFinite)).toBe(true)
      expect(g.getAttribute('color').count).toBe(position.count)
      total+=triangles*counts[i];g.dispose()
    })
    expect(total).toBeLessThan(120000)
  })
})
