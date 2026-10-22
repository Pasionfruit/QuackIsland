import { expect,it } from 'vitest'
import { createTrack,record,sampleTrack } from '../internal/interpolate'
import type { DuckState } from '../internal/protocol'
import { NET } from '../internal/protocol'

it('keeps the nearer duck expression when interpolating remote movement',()=>{
  const track=createTrack('duck')
  const pose:DuckState={x:0,y:0,z:0,facing:0,lean:0,swimming:false,speed:0}
  record(track,100,{...pose,emote:'smile'})
  record(track,200,{...pose,x:10,emote:'laugh'})
  expect(sampleTrack(track,125+NET.delay)?.emote).toBe('smile')
  expect(sampleTrack(track,175+NET.delay)?.emote).toBe('laugh')
  expect(sampleTrack(track,175+NET.delay)?.x).toBeCloseTo(7.5)
})

it('uses the neutral duck expression for older snapshots without emotes',()=>{
  const track=createTrack('older duck')
  const pose:DuckState={x:0,y:0,z:0,facing:0,lean:0,swimming:false,speed:0}
  record(track,100,pose);record(track,200,pose)
  expect(sampleTrack(track,150+NET.delay)?.emote).toBe('smile')
})
