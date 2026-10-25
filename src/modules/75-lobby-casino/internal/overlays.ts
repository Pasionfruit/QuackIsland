import { BufferGeometry, Float32BufferAttribute, Matrix4, PlaneGeometry, Quaternion, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ATLAS_RECTS, ATLAS_SIZE } from './atlas'
import { stationMatrix, type CasinoStation } from './layout'

export function casinoOverlayGeometry(stations:readonly CasinoStation[]):BufferGeometry {
  const pieces:BufferGeometry[]=[]
  const panel=(station:CasinoStation,cell:number,w:number,h:number,position:[number,number,number],vertical=false,yaw=0)=>{
    const geometry=new PlaneGeometry(w,h),uv=geometry.getAttribute('uv'),[x,y,width,height]=ATLAS_RECTS[cell]
    for(let i=0;i<uv.count;i++)uv.setXY(i,(x+uv.getX(i)*width)/ATLAS_SIZE,1-(y+(1-uv.getY(i))*height)/ATLAS_SIZE)
    const rotation=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),vertical?0:-Math.PI/2)
    rotation.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),yaw))
    geometry.applyMatrix4(new Matrix4().compose(new Vector3(...position),rotation,new Vector3(1,1,1)))
    geometry.applyMatrix4(stationMatrix(station));pieces.push(geometry)
  }
  for(const station of stations){
    switch(station.kind){
      case 'blackjack':
        panel(station,0,2.4,.6,[0,1.062,.1])
        for(const [x,z,first]of [[-.4,-.3,6],[-.1,.65,8]])for(let i=0;i<2;i++)panel(station,first+i,.17,.25,[x+i*.2,1.078,z],false,i*.12)
        break
      case 'roulette':panel(station,1,1.8,1.7,[.88,1.081,0]);break
      case 'slots':panel(station,2,1.46,.88,[0,1.32,.563],true);panel(station,5,1.6,.41,[0,2.07,.356],true);break
      case 'baccarat':
        panel(station,3,3,1.6,[0,1.081,0])
        for(const [x,z,first]of [[-.8,.15,6],[.5,.15,8]])for(let i=0;i<2;i++)panel(station,first+i,.17,.25,[x+i*.2,1.095,z],false,i*.12)
        break
      case 'craps':panel(station,4,3.85,1.85,[0,1.081,0]);break
    }
  }
  if(!pieces.length){const empty=new BufferGeometry();empty.setAttribute('position',new Float32BufferAttribute([],3));return empty}
  const result=mergeGeometries(pieces);pieces.forEach(p=>p.dispose())
  if(!result)throw Error('Could not build casino printing')
  result.name='casino-table-graphics';result.computeBoundingBox();result.computeBoundingSphere();return result
}
