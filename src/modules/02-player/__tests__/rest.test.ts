import { Box3, Group, Mesh } from 'three'
import { describe, expect, it } from 'vitest'
import { bodyPose, createAvatar, setAvatarWalk } from '../internal/avatar'
import { createPlayer, IDLE_INPUT, PLAYER, stepPlayer } from '../internal/controller'
import { advanceRest } from '../internal/rest'
import { walkPose } from '../internal/walk'

describe('ground sitting and seated swimming',()=>{
  it('holds still on land with Control, ignores jumping, and stands on release',()=>{
    const p=createPlayer(0,0,()=>2)
    for(let i=0;i<30;i++)stepPlayer(p,{...IDLE_INPUT,sit:true,forward:true,jump:true},1/60,()=>2)
    expect(p.sitting).toBe(true);expect(p.x).toBe(0);expect(p.z).toBe(0);expect(p.y).toBe(2);expect(p.speed).toBe(0)
    stepPlayer(p,{...IDLE_INPUT,forward:true},1/60,()=>2)
    expect(p.sitting).toBe(false);expect(p.z).toBeGreaterThan(0)
  })
  it('does not freeze gravity or sit in mid-air',()=>{
    const p=createPlayer(0,0,()=>2)
    stepPlayer(p,{...IDLE_INPUT,jump:true},1/60,()=>2)
    const height=p.y
    stepPlayer(p,{...IDLE_INPUT,sit:true},1/60,()=>2)
    expect(p.sitting).toBe(false);expect(p.y).toBeGreaterThan(height)
    for(let i=0;i<100;i++)stepPlayer(p,{...IDLE_INPUT,sit:true},1/60,()=>2)
    expect(p.grounded).toBe(true);expect(p.sitting).toBe(true);expect(p.y).toBe(2)
  })
  it('tucks the feet and lowers the belly without sinking through land',()=>{
    const duck=createAvatar(),body=duck.getObjectByName('duck-body') as Mesh
    const standing=new Box3().setFromObject(duck,true)
    setAvatarWalk(duck,walkPose({phase:0,amount:0}),1)
    const seated=new Box3().setFromObject(duck,true)
    expect(seated.min.y).toBeGreaterThanOrEqual(-.001)
    expect(seated.max.y).toBeLessThan(standing.max.y-.1)
    expect(body.morphTargetInfluences![2]).toBeGreaterThan(1)
    expect(body.morphTargetInfluences![3]).toBeGreaterThan(1)
  })
  it('floats upright at the surface with its belly in water and can swim while Control is held',()=>{
    const p=createPlayer(0,0,()=>-4)
    for(let i=0;i<150;i++)stepPlayer(p,{...IDLE_INPUT,sit:true,forward:true},1/60,()=>-4,{seaLevel:0})
    expect(p.swimming).toBe(true);expect(p.sitting).toBe(false);expect(p.speed).toBe(PLAYER.swimSpeed)
    expect(p.z).toBeGreaterThan(8);expect(p.y).toBeCloseTo(-PLAYER.floatDepth,3)
    const pose=bodyPose(p.lean,PLAYER.height,PLAYER.radius)
    expect(pose.tip).toBe(0)
    const duck=createAvatar(),root=new Group()
    root.position.y=p.y;root.add(duck)
    setAvatarWalk(duck,walkPose({phase:0,amount:0}),1)
    const box=new Box3().setFromObject(root,true)
    expect(box.min.y).toBeGreaterThan(-.3);expect(box.min.y).toBeLessThan(0)
    expect(box.max.y).toBeGreaterThan(1)
  })
  it('eases into a seat and releases it for a jump or stun',()=>{
    const state={swimming:false,sitting:true,stun:0,grounded:true}
    let seat=advanceRest(0,state,1/60)
    expect(seat).toBeGreaterThan(0);expect(seat).toBeLessThan(.3)
    for(let i=0;i<90;i++)seat=advanceRest(seat,state,1/60)
    expect(seat).toBe(1)
    state.stun=1
    for(let i=0;i<90;i++)seat=advanceRest(seat,state,1/60)
    expect(seat).toBe(0)
  })
})
