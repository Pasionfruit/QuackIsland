import { useEffect, useMemo } from 'react'
import { Mesh } from 'three'
import { createRng, hashSeed, CONVENTIONS } from '../../00-core'
import { ArtBatch, disposeArt, type Point } from './geometry'
import { prop } from './props'
import { ART_DIRECTIONS, type MinigameArtId, type ArtDirection } from './themes'

export interface ArtLayout {halfWidth?:number;halfDepth?:number;center?:Point;scale?:number;followCameraHeight?:boolean}
export function createMinigameArt(game:MinigameArtId,layout:ArtLayout={}) {
  const direction:ArtDirection=ART_DIRECTIONS[game]
  const w=layout.halfWidth??direction.halfWidth,d=layout.halfDepth??direction.halfDepth
  const scale=layout.scale??direction.scale??1,center=layout.center??direction.center??[0,0,0]
  if(!Number.isFinite(w)||!Number.isFinite(d)||w<=0||d<=0||!Number.isFinite(scale)||scale<=0||!center.every(Number.isFinite))throw new Error('Invalid art layout')
  const b=new ArtBatch(),p=direction.palette,rng=createRng(hashSeed(CONVENTIONS.worldSeed,`minigame-art:${game}`))
  // Four compact tableaux beyond the clear gameplay envelope, never over the near edge.
  // Keep the nearest point of each 3.4-wide footprint outside the collision rectangle.
  const places:(readonly [number,number,number,number])[]=[
    [-w*.6,0,-d-2.2*scale,.12], [w*.6,0,-d-2.2*scale,-.18],
    [-w-2.2*scale,0,-d*.3,Math.PI/2], [w+2.2*scale,0,-d*.3,-Math.PI/2],
  ]
  // Long racing lanes and large fields need scenery along their length, too.
  if(d>35)for(let i=1;i<=3;i++)for(const side of [-1,1])places.push([side*(w+2.2*scale),0,-d+(d*2/4)*i,side<0?Math.PI/2:-Math.PI/2])
  places.forEach(([x,y,z,yaw],i)=>{
    b.at([x,y,z],yaw,scale,()=>{
      // A weathered base seats objects in the world and gives floating arenas a real edge.
      b.cylinder([0,-.16,0],1.55,1.25,.3,p.dark,undefined,'matte',12)
      b.cylinder([0,-.025,0],1.5,1.5,.04,p.base,undefined,'matte',12)
      b.at([-.25,0,-.08],.1*(rng()-.5),1,()=>prop(b,direction.props[i%4],p))
      b.at([.93,0,.35],-.18,.45,()=>prop(b,direction.props[(i+1)%4],p))
      // Small contact details: chips, bolts, moss and drifted leaves, kept off play paths.
      for(let j=0;j<6;j++){
        const a=rng()*Math.PI*2,r=.85+rng()*.55
        b.ball([Math.sin(a)*r,.02,Math.cos(a)*r],[.09+rng()*.1,.045,.08+rng()*.1],j%3?p.light:p.leaf)
      }
    })
  })
  const group=b.finish(`minigame-art:${game}`)
  group.position.set(...center)
  // The endless tower's scenery follows its camera vertically. Cosmetic render
  // callbacks work in both native Three and R3F without taking over either loop.
  if(layout.followCameraHeight)for(const mesh of group.children as Mesh[]){
    mesh.frustumCulled=false
    mesh.onBeforeRender=(_renderer,_scene,camera)=>{
      const y=center[1]+camera.matrixWorld.elements[13]-4
      if(group.position.y!==y){group.position.y=y;group.updateMatrixWorld(true)}
    }
  }
  group.userData.game=game;group.userData.direction=direction.name
  group.userData.clearance={halfWidth:w,halfDepth:d,center:[...center]}
  return group
}

/** Memoized scene dressing. No lights, camera changes, colliders, input or simulation. */
export function MinigameArt({game,halfWidth,halfDepth,center,scale,followCameraHeight=false}:{game:MinigameArtId}&ArtLayout) {
  const [x,y,z]=center??ART_DIRECTIONS[game].center??[0,0,0]
  const art=useMemo(()=>createMinigameArt(game,{halfWidth,halfDepth,scale,center:[x,y,z],followCameraHeight}),[game,halfWidth,halfDepth,scale,x,y,z,followCameraHeight])
  useEffect(()=>()=>disposeArt(art),[art])
  return <primitive object={art} dispose={null}/>
}
