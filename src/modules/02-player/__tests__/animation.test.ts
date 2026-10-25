import { Group, Matrix4, Mesh, PerspectiveCamera, Scene, Vector3, type Material, type WebGLRenderer } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAvatar } from '../internal/avatar'
import { updateAvatarAnimation } from '../internal/animation'

const bodyOf=(avatar:Group)=>avatar.getObjectByName('duck-body') as Mesh
const weights=(avatar:Group)=>bodyOf(avatar).morphTargetInfluences!
const idle=(avatar:Group)=>weights(avatar).every(n=>Math.abs(n)<.0001)
afterEach(()=>vi.restoreAllMocks())

describe('shared minigame duck animation',()=>{
  it('follows game-owned parent movement, including scaled and rotated adapters',()=>{
    const holder=new Group(),duck=createAvatar(),other=createAvatar()
    holder.rotation.y=Math.PI;holder.scale.setScalar(.87);holder.add(duck)
    updateAvatarAnimation(duck,0)
    for(let i=0;i<20;i++){holder.position.x+=.1;updateAvatarAnimation(duck,1/60)}
    expect(weights(duck).slice(0,4).some(n=>Math.abs(n)>.1)).toBe(true)
    expect(duck.position.toArray()).toEqual([0,0,0])
    expect(duck.rotation.toArray().slice(0,3)).toEqual([0,0,0])
    expect(holder.position.x).toBeCloseTo(2)
    expect(holder.rotation.y).toBe(Math.PI)
    expect(idle(other)).toBe(true)
    expect(bodyOf(other).geometry).toBe(bodyOf(duck).geometry)
  })
  it('runs with a quicker cadence than walking',()=>{
    const crossings=(speed:number)=>{
      const duck=createAvatar();updateAvatarAnimation(duck,0)
      let previous=0,count=0
      for(let i=0;i<120;i++){
        duck.position.z+=speed/60;updateAvatarAnimation(duck,1/60)
        const sign=Math.sign(weights(duck)[0]);if(previous&&sign!==previous)count++
        previous=sign
      }
      return count
    }
    expect(crossings(17)).toBeGreaterThan(crossings(9.5))
  })
  it('keeps the same walking pose across 15, 30, 60 and 120 fps',()=>{
    const poses=[15,30,60,120].map(fps=>{
      const duck=createAvatar();updateAvatarAnimation(duck,0)
      for(let i=0;i<fps;i++){duck.position.z+=9.5/fps;updateAvatarAnimation(duck,1/fps)}
      return [...weights(duck)]
    })
    for(const pose of poses)pose.forEach((value,i)=>expect(value).toBeCloseTo(poses[0][i],8))
  })
  it('flaps through a running jump, folds after landing, and preserves the trajectory',()=>{
    const duck=createAvatar();updateAvatarAnimation(duck,0)
    let flapped=false
    for(let frame=1;frame<=60;frame++){
      const t=frame/60,y=Math.max(0,11*t-13*t*t)
      duck.position.set(17*t,y,0);updateAvatarAnimation(duck,1/60)
      expect(duck.position.y).toBe(y);expect(duck.position.x).toBe(17*t)
      if(y>.2&&weights(duck)[4]+weights(duck)[5]>.2)flapped=true
    }
    expect(flapped).toBe(true)
    for(let i=0;i<90;i++)updateAvatarAnimation(duck,1/60)
    expect(idle(duck)).toBe(true)
  })
  it('recognizes landing on a higher platform and resumes walking there',()=>{
    const duck=createAvatar();updateAvatarAnimation(duck,0)
    for(let frame=1;frame<=65;frame++){
      const t=frame/60,y=11*t-13*t*t
      duck.position.y=t>.4?Math.max(.8,y):y;updateAvatarAnimation(duck,1/60)
    }
    for(let i=0;i<60;i++){duck.position.x+=.1;updateAvatarAnimation(duck,1/60)}
    expect(duck.position.y).toBe(.8)
    expect(weights(duck)[4]+weights(duck)[5]).toBeLessThan(.0001)
    expect(weights(duck).slice(0,4).some(n=>Math.abs(n)>.1)).toBe(true)
  })
  it('does not treat ramps, tiny running bobs, resets, or long frame gaps as jumps',()=>{
    const duck=createAvatar();updateAvatarAnimation(duck,0)
    for(let i=1;i<=120;i++){
      duck.position.set(i*.1,i*.02+Math.sin(i*.3)*.025,0);updateAvatarAnimation(duck,1/60)
      expect(weights(duck)[4]+weights(duck)[5]).toBe(0)
    }
    duck.position.set(-40,5,50);updateAvatarAnimation(duck,1/60);expect(idle(duck)).toBe(true)
    duck.position.y+=1;updateAvatarAnimation(duck,1/60);expect(idle(duck)).toBe(true)
    duck.position.x+=1;updateAvatarAnimation(duck,2);expect(idle(duck)).toBe(true)
  })
  it('settles without measuring its own cosmetic bob as movement',()=>{
    const duck=createAvatar();updateAvatarAnimation(duck,0)
    for(let i=0;i<30;i++){duck.position.x+=.13;updateAvatarAnimation(duck,1/60)}
    expect(idle(duck)).toBe(false)
    const anchor=duck.position.clone()
    for(let i=0;i<120;i++)updateAvatarAnimation(duck,1/60)
    expect(idle(duck)).toBe(true)
    expect(duck.position.equals(anchor)).toBe(true)
    expect(duck.getObjectByName('avatar-motion')!.position.y).toBe(0)
  })
  it('supports exact controller state, seated swimming and paused poses',()=>{
    const duck=createAvatar('#e0563f',{automaticAnimation:false})
    updateAvatarAnimation(duck,1/60,{grounded:false,jumped:true,speed:0})
    expect(weights(duck)[4]+weights(duck)[5]).toBeGreaterThan(0)
    const before=[...weights(duck)]
    updateAvatarAnimation(duck,1,{paused:true})
    expect(weights(duck)).toEqual(before)
    for(let i=0;i<90;i++)updateAvatarAnimation(duck,1/60,{grounded:false,swimming:true,speed:5})
    expect(weights(duck)[4]+weights(duck)[5]).toBe(0)
    expect(weights(duck)[2]).toBeGreaterThan(1)
    expect(duck.getObjectByName('avatar-motion')!.position.y).toBeCloseTo(-.16)
  })
  it('advances once across shadow and colour passes and refreshes the shadow transform',()=>{
    const duck=createAvatar(),body=bodyOf(duck),head=duck.getObjectByName('avatar-head')!.children[0] as Mesh
    const renderer={info:{render:{frame:0}}} as unknown as WebGLRenderer
    const scene=new Scene(),drawGroup=new Group(),camera=new PerspectiveCamera();camera.position.set(0,3,6);camera.lookAt(0,0,0);camera.updateMatrixWorld()
    const clock=vi.spyOn(performance,'now').mockReturnValue(0)
    body.onBeforeShadow(renderer,scene,camera,camera,body.geometry,body.material as Material,drawGroup)
    for(let i=1;i<=12;i++){
      duck.position.x+=.12;renderer.info.render.frame=i;clock.mockReturnValue(i*1000/60)
      body.onBeforeShadow(renderer,scene,camera,camera,body.geometry,body.material as Material,drawGroup)
      const first=[...weights(duck)]
      head.onBeforeRender(renderer,scene,camera,head.geometry,head.material as Material,drawGroup)
      body.onBeforeRender(renderer,scene,camera,body.geometry,body.material as Material,drawGroup)
      expect(weights(duck)).toEqual(first)
      expect(body.modelViewMatrix.equals(new Matrix4().multiplyMatrices(camera.matrixWorldInverse,body.matrixWorld))).toBe(true)
    }
    expect(idle(duck)).toBe(false)
  })
  it('keeps a controller-owned avatar out of the automatic render hook',()=>{
    const duck=createAvatar('#aabbcc',{automaticAnimation:false}),body=bodyOf(duck)
    const renderer={info:{render:{frame:1}}} as unknown as WebGLRenderer
    duck.position.x=2
    body.onBeforeRender(renderer,new Scene(),new PerspectiveCamera(),body.geometry,body.material as Material,new Group())
    expect(idle(duck)).toBe(true)
    expect(duck.position.distanceTo(new Vector3(2,0,0))).toBe(0)
  })
})
