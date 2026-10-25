import { CONVENTIONS, TIDE_MAX, createRng } from '../../00-core'
import { FLORA, type FloraField, type GroundSample, type Occupied, type Planting } from './scatter'

export const OASIS = { nooks: 3, flowers: 32 } as const
export interface OasisField { nooks: Planting[]; flowers: Planting[]; stones: Planting[] }

export function scatterOasis(ground:(x:number,z:number)=>GroundSample,flora:FloraField,
  options:{radius:number;occupied:readonly Occupied[]},seed:number=CONVENTIONS.worldSeed):OasisField {
  const rng=createRng(seed^0x4f415349),field:OasisField={nooks:[],flowers:[],stones:[]}
  const site=(x:number,z:number,margin:number,slope=.25):Planting|null=>{
    if(Math.hypot(x,z)<FLORA.spawnClear+margin||Math.hypot(x,z)>options.radius||
      options.occupied.some(p=>Math.hypot(x-p.x,z-p.z)<p.radius+margin))return null
    const g=ground(x,z)
    if(![g.height,g.slope,g.normalX,g.normalY,g.normalZ].every(Number.isFinite)||g.height<TIDE_MAX+.6||g.slope>slope||g.normalY<=0)return null
    return {x,y:g.height,z,nx:g.normalX,ny:g.normalY,nz:g.normalZ,yaw:rng()*Math.PI*2,scale:1}
  }
  for(let attempt=0;field.nooks.length<OASIS.nooks&&attempt<6000;attempt++) {
    const angle=rng()*Math.PI*2,r=20+rng()*Math.min(65,Math.max(0,options.radius-20))
    const x=Math.cos(angle)*r,z=Math.sin(angle)*r
    if(field.nooks.some(p=>Math.hypot(x-p.x,z-p.z)<24)||flora.palms.some(p=>Math.hypot(x-p.x,z-p.z)<5.5))continue
    const p=site(x,z,4,.2)
    if(!p)continue
    const corners=[[-2.8,-2.4],[-2.8,2.4],[2.8,-2.4],[2.8,2.4]]
    if(corners.some(([dx,dz])=>Math.abs(ground(x+dx,z+dz).height-p.y)>1.1))continue
    p.yaw=Math.atan2(-x,-z);field.nooks.push(p)
  }
  for(let attempt=0;field.flowers.length<OASIS.flowers&&attempt<4000;attempt++) {
    const anchors=field.flowers.length<18&&field.nooks.length?field.nooks:flora.palms
    if(!anchors.length)break
    const anchor=anchors[Math.floor(rng()*anchors.length)],angle=rng()*Math.PI*2,r=4.5+rng()*3
    const x=anchor.x+Math.cos(angle)*r,z=anchor.z+Math.sin(angle)*r
    if(field.flowers.some(p=>Math.hypot(x-p.x,z-p.z)<1.4)||field.nooks.some(p=>Math.hypot(x-p.x,z-p.z)<4))continue
    const p=site(x,z,.8)
    if(p){p.scale=.85+rng()*.5;field.flowers.push(p)}
  }
  for(const nook of field.nooks) {
    const distance=Math.hypot(nook.x,nook.z),count=Math.floor((distance-13)/1.65)
    const dx=nook.x/distance,dz=nook.z/distance
    for(let i=0;i<count;i++) {
      const along=12+i*1.65,curve=Math.sin(i/Math.max(1,count-1)*Math.PI)*1.8
      const x=dx*along-dz*curve,z=dz*along+dx*curve
      if(flora.palms.some(p=>Math.hypot(x-p.x,z-p.z)<1.1)||field.stones.some(p=>Math.hypot(x-p.x,z-p.z)<.7))continue
      const p=site(x,z,.55,.35)
      if(p){p.y+=.008;p.scale=.9+rng()*.3;field.stones.push(p)}
    }
  }
  return field
}
