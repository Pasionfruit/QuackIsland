import { Group, Mesh, Vector3, type WebGLRenderer } from 'three'
import { advanceWalk, createWalkState, walkPose, type WalkPose } from './walk'
import { advanceFlap, createFlapState, flapPose } from './flap'
import { advanceRest } from './rest'

export interface AvatarOptions { automaticAnimation?:boolean }
/** Optional exact state for a controller that advances animation itself. */
export interface AvatarMotion {
  speed?:number;grounded?:boolean;jumped?:boolean;swimming?:boolean;stunned?:boolean;sitting?:boolean;paused?:boolean
}
type Apply=(walk:WalkPose,flap:ReturnType<typeof flapPose>,seated:number)=>void
function makeRig(visual:Group,apply:Apply){
  return {visual,apply,initialized:false,last:new Vector3(),point:new Vector3(),scale:new Vector3(),up:new Vector3(),lastScale:1,
    floorY:0,candidate:null as number|null,airborne:false,descended:false,quiet:0,recovery:0,
    walk:createWalkState(),flap:createFlapState(),rest:0,lastRenderer:null as WebGLRenderer|null,lastFrame:-1,lastTime:0}
}
type Rig=ReturnType<typeof makeRig>
const rigs=new WeakMap<Group,Rig>()

function reset(rig:Rig){
  rig.initialized=true;rig.last.copy(rig.point);rig.lastScale=rig.scale.y;rig.floorY=rig.point.y
  rig.candidate=null;rig.airborne=false;rig.descended=false;rig.quiet=0;rig.recovery=0
  rig.walk=createWalkState();rig.flap=createFlapState();rig.rest=0
  rig.apply(walkPose(rig.walk),flapPose(rig.flap),0);rig.visual.updateMatrixWorld(true)
}

/** Observe the game-owned world anchor; cosmetic child movement never feeds back. */
export function updateAvatarAnimation(avatar:Group,delta:number,motion?:AvatarMotion):boolean {
  const rig=rigs.get(avatar)
  if(!rig||!Number.isFinite(delta)||delta<0)return false
  avatar.updateWorldMatrix(true,false)
  rig.point.setFromMatrixPosition(avatar.matrixWorld);rig.scale.setFromMatrixScale(avatar.matrixWorld)
  const scale=Math.abs(rig.scale.y)
  if(scale<.0001)return false
  if(!rig.initialized){reset(rig);if(!motion)return true}
  if(motion?.paused){rig.last.copy(rig.point);rig.lastScale=scale;return false}
  const dx=(rig.point.x-rig.last.x)/scale,dy=(rig.point.y-rig.last.y)/scale,dz=(rig.point.z-rig.last.z)/scale
  if(delta>.25||Math.hypot(dx,dy,dz)>Math.max(2,delta*80)||Math.abs(dy)>Math.max(.6,delta*32)||Math.abs(scale-rig.lastScale)/scale>.15){reset(rig);return true}
  if(delta===0){rig.last.copy(rig.point);return false}
  const dt=Math.min(delta,.1),distance=Math.hypot(dx,dz),speed=distance/dt,vy=dy/dt
  rig.up.set(0,1,0).transformDirection(avatar.matrixWorld)
  const upright=rig.up.y>.7
  let jumped=false,landed=false
  rig.recovery=Math.max(0,rig.recovery-dt)
  if(!upright){
    rig.airborne=false;rig.candidate=null;rig.floorY=rig.point.y;rig.recovery=.2
  }else if(!rig.airborne){
    // Ignore shallow ramps and tiny idle/run bobs, but recognize actual upward hops.
    if(rig.recovery===0&&vy>Math.max(1.2,speed*.4)){
      rig.candidate??=rig.last.y
      if((rig.point.y-rig.candidate)/scale>.1){
        rig.airborne=true;rig.floorY=rig.candidate;rig.descended=false;rig.quiet=0;jumped=true
      }
    }else{rig.candidate=null;rig.floorY=rig.point.y}
  }else{
    if(vy<-.6)rig.descended=true
    rig.quiet=Math.abs(vy)<.25?rig.quiet+dt:0
    if(((rig.point.y-rig.floorY)/scale<=.045&&vy<=.5)||(rig.descended&&rig.quiet>.055)){
      rig.airborne=false;rig.floorY=rig.point.y;rig.candidate=null;rig.quiet=0;landed=true
    }
  }
  const grounded=motion?.grounded??(upright&&!rig.airborne&&(landed||Math.abs(vy)<=Math.max(2,speed*.4)))
  const swimming=!!motion?.swimming,stunned=motion?.stunned??!upright,sitting=!!motion?.sitting
  const travelled=motion?.speed!==undefined&&Number.isFinite(motion.speed)?Math.max(0,motion.speed)*dt/scale:distance
  let remaining=dt,first=true
  while(remaining>1e-8){
    const step=Math.min(remaining,.05)
    advanceWalk(rig.walk,travelled*step/dt,step,grounded&&!swimming&&!stunned&&!sitting)
    advanceFlap(rig.flap,step,{jumped:first&&(motion?.jumped??jumped),grounded,swimming,stunned})
    rig.rest=advanceRest(rig.rest,{grounded,swimming,sitting,stun:stunned?1:0},step)
    remaining-=step;first=false
  }
  rig.apply(walkPose(rig.walk),flapPose(rig.flap),rig.rest)
  rig.last.copy(rig.point);rig.lastScale=scale;rig.visual.updateMatrixWorld(true)
  return true
}

/** Render callbacks cover R3F and direct Three scenes, including remote/bot avatars. */
export function bindAvatarAnimation(avatar:Group,visual:Group,meshes:readonly Mesh[],apply:Apply,automatic:boolean):void {
  const rig=makeRig(visual,apply);rigs.set(avatar,rig)
  if(!automatic)return
  const update=(renderer:WebGLRenderer)=>{
    if(rig.lastRenderer===renderer&&rig.lastFrame===renderer.info.render.frame)return
    const now=performance.now()/1000
    const delta=rig.lastRenderer===renderer?Math.max(0,now-rig.lastTime):0
    rig.lastRenderer=renderer;rig.lastFrame=renderer.info.render.frame;rig.lastTime=now
    updateAvatarAnimation(avatar,delta)
  }
  for(const mesh of meshes){
    mesh.onBeforeRender=update
    mesh.onBeforeShadow=(renderer,_object,_camera,shadowCamera)=>{
      update(renderer)
      // Three computes this before the shadow hook; refresh it after the visual pose.
      mesh.modelViewMatrix.multiplyMatrices(shadowCamera.matrixWorldInverse,mesh.matrixWorld)
      mesh.normalMatrix.getNormalMatrix(mesh.modelViewMatrix)
    }
  }
}
