import { BoxGeometry, BufferGeometry, CylinderGeometry, Euler, Float32BufferAttribute, IcosahedronGeometry, Quaternion, SphereGeometry, Vector3 } from 'three'
import { CONVENTIONS, createRng } from '../../00-core'
import { sculpt } from './geometry'

export function retreatGeometry(): BufferGeometry {
  const {add,finish}=sculpt()
  const box=(size:[number,number,number],at:[number,number,number],colour:string,rx=0)=>
    add(new BoxGeometry(...size),colour,new Vector3(...at),new Vector3(1,1,1),new Quaternion().setFromEuler(new Euler(rx,0,0)))
  const rope=(a:Vector3,b:Vector3,radius=.022,colour='#baa17c')=>{
    const direction=b.clone().sub(a)
    add(new CylinderGeometry(radius,radius,direction.length(),5),colour,a.clone().add(b).multiplyScalar(.5),new Vector3(1,1,1),new Quaternion().setFromUnitVectors(new Vector3(0,1,0),direction.normalize()))
  }
  // A low woven mat keeps this decorative nook level with the walking surface.
  box([5.6,.024,4.8],[0,.012,0],'#bda980')
  for(let i=0;i<9;i++)box([.035,.004,4.65],[-2.45+i*.61,.026,0],i%2?'#dfcfac':'#8f9270')
  for(const x of [-2.55,2.55])for(const z of [-2.1,2.1]) {
    add(new CylinderGeometry(.075,.095,2.95,7),'#a77d50',new Vector3(x,1.5,z))
  }
  for(const z of [-2.1,2.1])box([5.55,.14,.14],[0,3,z],'#88613e')
  for(const x of [-2.55,2.55])box([.14,.14,4.4],[x,3,0],'#88613e')
  for(let i=0;i<11;i++)box([5.3,.045,.18],[0,3.1,-1.9+i*.38],i%2?'#b99869':'#c8ad7c')
  // The hammock is a curved fabric surface, with four ropes to the rear posts.
  for(let i=0;i<10;i++) {
    const positions:number[]=[]
    const point=(u:number,v:number)=>new Vector3(u,.9+.7*(u/2)**2+.1*(v/.48)**2,-1.4+v)
    for(let j=0;j<2;j++) {
      const x0=-2+i*.4,x1=x0+.4,z0=-.48+j*.48,z1=z0+.48
      const a=point(x0,z0),b=point(x1,z0),c=point(x1,z1),d=point(x0,z1)
      for(const p of [a,b,c,a,c,d])positions.push(p.x,p.y,p.z)
    }
    const cloth=new BufferGeometry();cloth.setAttribute('position',new Float32BufferAttribute(positions,3));cloth.computeVertexNormals()
    add(cloth,i%3===0?'#8aaba0':'#f1e7cd')
  }
  for(const side of [-1,1])for(const z of [-.48,.48])rope(new Vector3(side*2,1.7,-1.4+z),new Vector3(side*2.55,2.35,-2.1))
  for(const x of [-1.3,1.3]) {
    for(const side of [-.37,.37])for(const z of [.55,1.25])box([.075,.34,.075],[x+side,.19,z],'#8c6946')
    box([.86,.065,.92],[x,.39,.9],'#e9dec2')
    box([.86,1.0,.07],[x,.85,.48],x<0?'#7faea6':'#e2b99a',-.32)
    for(const side of [-.46,.46])box([.07,.07,1.1],[x+side,.57,.85],'#aa865a',-.1)
    add(new SphereGeometry(.2,7,4),'#f3e9cf',new Vector3(x,.56,.58),new Vector3(1.5,.55,.9))
  }
  add(new CylinderGeometry(.38,.4,.07,10),'#c4a67a',new Vector3(0,.43,1))
  add(new CylinderGeometry(.07,.18,.38,6),'#94704b',new Vector3(0,.22,1))
  for(const x of [-.16,.16]) {
    add(new IcosahedronGeometry(.14,0),'#826146',new Vector3(x,.59,1))
    rope(new Vector3(x,.68,1),new Vector3(x+.04,.91,1),.012,'#efe3b2')
  }
  for(const side of [-1,1]) {
    rope(new Vector3(side*2.55,2.65,2.1),new Vector3(side*2.27,2.65,1.92),.025,'#674e38')
    box([.18,.28,.18],[side*2.27,2.4,1.92],'#ffe1a3')
    add(new CylinderGeometry(0,.17,.15,4),'#725741',new Vector3(side*2.27,2.61,1.92))
    box([.23,.045,.23],[side*2.27,2.24,1.92],'#725741')
  }
  return finish('oasis-shaded-retreat')
}

export function flowerGeometry(): BufferGeometry {
  const {add,finish}=sculpt(),rng=createRng(CONVENTIONS.worldSeed^0x424c4f4f)
  for(let i=0;i<14;i++) {
    const angle=i/14*Math.PI*2,length=.4+rng()*.4
    const vertices=[0,.12,0,Math.cos(angle)*length,.32+rng()*.2,Math.sin(angle)*length,
      Math.cos(angle+.5)*length*.6,.12,Math.sin(angle+.5)*length*.6]
    const leaf=new BufferGeometry();leaf.setAttribute('position',new Float32BufferAttribute(vertices,3));leaf.computeVertexNormals()
    add(leaf,i%2?'#4c864f':'#6e9b53')
  }
  for(let f=0;f<3;f++) {
    const a=f/3*Math.PI*2,x=Math.cos(a)*.3,z=Math.sin(a)*.3,height=.5+f*.12
    add(new CylinderGeometry(.018,.025,height,5),'#658b4c',new Vector3(x,height/2,z))
    for(let petal=0;petal<5;petal++) {
      const angle=petal/5*Math.PI*2
      add(new SphereGeometry(.11,5,3),f%2?'#f5b4a0':'#d7869c',new Vector3(x+Math.cos(angle)*.115,height,z+Math.sin(angle)*.115),new Vector3(1,.4,1.25))
    }
    add(new IcosahedronGeometry(.065,0),'#f8d57a',new Vector3(x,height+.02,z))
  }
  return finish('oasis-flowering-shrub')
}

export function steppingStoneGeometry(): BufferGeometry {
  const {add,finish}=sculpt()
  add(new IcosahedronGeometry(.43,0),'#c5b99b',new Vector3(),new Vector3(1,.085,.8))
  return finish('oasis-stepping-stone')
}
