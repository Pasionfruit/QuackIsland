import { Matrix4, Quaternion, Vector3 } from 'three'
import { TIDE_MAX } from '../../00-core'

export const CASINO_KINDS=['blackjack','roulette','slots','baccarat','craps'] as const
export type CasinoKind=typeof CASINO_KINDS[number]
export interface CasinoStation {
  kind:CasinoKind;name:string;x:number;y:number;z:number;yaw:number;nx:number;ny:number;nz:number
}
export const CASINO_NAMES:Record<CasinoKind,string>={blackjack:'Blackjack',roulette:'Roulette',slots:'Five-reel slots',baccarat:'Baccarat',craps:'Craps'}
export interface CasinoGround { height:number;normalX:number;normalY:number;normalZ:number;slope:number }

/** Five inward-facing stations preserve a clear spawn and walking lanes. */
export function layoutCasino(ground:(x:number,z:number)=>CasinoGround,rocks:readonly {x:number;z:number;girth:number}[]=[]):CasinoStation[] {
  const result:CasinoStation[]=[]
  for(let i=0;i<CASINO_KINDS.length;i++) {
    const kind=CASINO_KINDS[i],preferred=Math.PI+(i-1)*Math.PI*2/5
    let chosen:CasinoStation|undefined
    for(const radius of [7,7.8,8.6,9.4]) {
      for(const offset of [0,.09,-.09,.18,-.18]) {
        const angle=preferred+offset,x=Math.sin(angle)*radius,z=Math.cos(angle)*radius
        const g=ground(x,z),clearance=kind==='slots'?1.5:2.6
        if(g.height<TIDE_MAX+.6||g.slope>.4||g.normalY<=0||![g.height,g.slope,g.normalX,g.normalY,g.normalZ].every(Number.isFinite)||
          rocks.some(r=>Math.hypot(x-r.x,z-r.z)<r.girth+clearance)||
          result.some(p=>Math.hypot(x-p.x,z-p.z)<5.8))continue
        chosen={kind,name:CASINO_NAMES[kind],x,y:g.height,z,yaw:Math.atan2(-x,-z),nx:g.normalX,ny:g.normalY,nz:g.normalZ}
        break
      }
      if(chosen)break
    }
    if(chosen)result.push(chosen)
  }
  return result
}

export function stationMatrix(p:CasinoStation):Matrix4 {
  const up=new Vector3(0,1,0),rotation=new Quaternion().setFromUnitVectors(up,new Vector3(p.nx,p.ny,p.nz).normalize())
  rotation.multiply(new Quaternion().setFromAxisAngle(up,p.yaw))
  return new Matrix4().compose(new Vector3(p.x,p.y,p.z),rotation,new Vector3(1,1,1))
}
