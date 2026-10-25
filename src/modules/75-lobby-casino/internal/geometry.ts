import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, Euler, Float32BufferAttribute, Matrix4, Quaternion, SphereGeometry, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { CasinoKind } from './layout'

const WOOD='#735138',GOLD='#c7a46a',FELT='#285e55',DARK='#263735',CREAM='#e8dfc8'
function sculpt(){
  const pieces:BufferGeometry[]=[]
  const add=(source:BufferGeometry,colour:string,at:[number,number,number]=[0,0,0],rotation:[number,number,number]=[0,0,0])=>{
    const g=source.index?source.toNonIndexed():source.clone();source.dispose()
    g.applyMatrix4(new Matrix4().compose(new Vector3(...at),new Quaternion().setFromEuler(new Euler(...rotation)),new Vector3(1,1,1)))
    g.deleteAttribute('uv')
    const c=new Color(colour),count=g.getAttribute('position').count,rgb=new Float32Array(count*3)
    for(let i=0;i<count;i++){rgb[i*3]=c.r;rgb[i*3+1]=c.g;rgb[i*3+2]=c.b}
    g.setAttribute('color',new Float32BufferAttribute(rgb,3));pieces.push(g)
  }
  const box=(size:[number,number,number],at:[number,number,number],colour:string,rotation:[number,number,number]=[0,0,0])=>add(new BoxGeometry(...size),colour,at,rotation)
  const cylinder=(r:number,height:number,at:[number,number,number],colour:string,segments=12)=>add(new CylinderGeometry(r,r,height,segments),colour,at)
  const stool=(x:number,z:number)=>{
    cylinder(.1,.55,[x,.3,z],GOLD,7);cylinder(.31,.07,[x,.055,z],DARK,12)
    cylinder(.32,.14,[x,.64,z],'#c58d69',12)
  }
  const chips=(x:number,z:number)=>{
    for(let stack=0;stack<3;stack++)for(let chip=0;chip<4;chip++)cylinder(.075,.022,[x+stack*.18,1.07+chip*.023,z],['#c87965','#e6d5a9','#7395aa'][stack],8)
  }
  const cards=(x:number,z:number,y=1.088)=>{
    for(let i=0;i<2;i++)box([.17,.009,.25],[x+i*.2,y,z],CREAM,[0,i*.12,0])
  }
  const table=(width:number,depth:number)=>{
    box([width,.18,depth],[0,.91,0],WOOD);box([width-.2,.065,depth-.2],[0,1.025,0],DARK)
    box([width-.38,.024,depth-.38],[0,1.065,0],FELT)
    for(const x of [-width*.34,width*.34])for(const z of [-depth*.28,depth*.28])box([.14,.82,.14],[x,.44,z],WOOD)
  }
  const finish=(name:string)=>{
    const g=mergeGeometries(pieces);pieces.forEach(p=>p.dispose())
    if(!g)throw Error('Could not build '+name)
    g.name=name;g.computeBoundingBox();g.computeBoundingSphere();return g
  }
  return {add,box,cylinder,stool,chips,cards,table,finish}
}

export function casinoGeometry(kind:CasinoKind):BufferGeometry {
  const s=sculpt(),{add,box,cylinder,stool,chips,cards,table,finish}=s
  const width=kind==='slots'?2.35:4.7,depth=kind==='slots'?2.8:3.7
  box([width,.018,depth],[0,.009,0],'#c1ac83')
  for(const z of [-depth/2+.12,depth/2-.12])box([width-.18,.005,.035],[0,.022,z],GOLD)
  if(kind==='blackjack'){
    add(new CylinderGeometry(1.85,1.85,.18,24,1,false,0,Math.PI),WOOD,[0,.92,-.65],[0,-Math.PI/2,0])
    add(new CylinderGeometry(1.69,1.69,.045,24,1,false,0,Math.PI),FELT,[0,1.035,-.65],[0,-Math.PI/2,0])
    box([3.7,.18,.1],[0,.92,-.65],WOOD)
    for(const x of [-1.15,1.15])box([.18,.82,.18],[x,.45,-.2],WOOD)
    box([.18,.82,.18],[0,.45,.8],WOOD)
    for(const [x,z]of[[-1.35,.85],[0,1.55],[1.35,.85]])stool(x,z)
    cards(-.4,-.3,1.072);cards(-.1,.65,1.072);chips(-1.1,-.3)
    box([.26,.12,.38],[1.15,1.105,-.42],DARK)
    box([.2,.07,.28],[1.15,1.15,-.4],CREAM)
  }else if(kind==='roulette'){
    table(4.2,2.4)
    cylinder(.82,.09,[-1.1,1.12,0],GOLD,24);cylinder(.72,.03,[-1.1,1.18,0],WOOD,24)
    for(let i=0;i<37;i++){
      const angle=i/37*Math.PI*2
      box([.075,.018,.17],[-1.1+Math.sin(angle)*.56,1.205,Math.cos(angle)*.56],i===0?'#5c9870':i%2?'#bf6355':'#293633',[0,angle,0])
    }
    cylinder(.38,.035,[-1.1,1.225,0],DARK,20)
    add(new CylinderGeometry(.025,.18,.17,10),GOLD,[-1.1,1.32,0])
    add(new SphereGeometry(.045,6,4),CREAM,[-.6,1.26,.36])
    chips(.4,-.9);stool(.5,1.5);stool(1.4,1.5)
  }else if(kind==='slots'){
    box([1.8,1.65,.74],[0,.91,0],DARK)
    box([1.9,.19,.85],[0,.15,0],WOOD)
    box([1.92,.1,.88],[0,1.8,0],GOLD)
    box([1.78,.57,.7],[0,2.07,0],FELT)
    box([1.62,1.04,.1],[0,1.31,.43],GOLD)
    box([1.5,.91,.12],[0,1.32,.49],'#20312f')
    for(let reel=0;reel<5;reel++)box([.014,.89,.025],[-.75+reel*.3,1.32,.56],GOLD)
    box([1.8,.12,.48],[0,.77,.58],WOOD)
    for(let i=0;i<3;i++)cylinder(.07,.025,[-.38+i*.25,.85,.68],i===2?'#bd7057':GOLD,8)
    box([.36,.05,.08],[.55,.86,.66],'#141f1c')
    box([.55,.04,.12],[0,.56,.4],GOLD)
    add(new CylinderGeometry(.035,.035,.55,7),GOLD,[1.03,1.2,0],[0,0,-.3])
    add(new SphereGeometry(.095,8,5),'#ba6957',[1.12,1.48,0])
    stool(0,1.25)
  }else if(kind==='baccarat'){
    table(3.8,2.25)
    for(const x of [-1.25,0,1.25])stool(x,1.45)
    cards(-.8,.15);cards(.5,.15);chips(-1.35,-.7);chips(.8,-.7)
    box([.3,.15,.43],[1.35,1.16,-.68],WOOD);box([.23,.08,.3],[1.35,1.2,-.65],CREAM)
  }else{
    table(4.25,2.35)
    for(const z of [-1.13,1.13])box([4.35,.18,.14],[0,1.14,z],DARK)
    for(const x of [-2.1,2.1])box([.14,.18,2.3],[x,1.14,0],DARK)
    for(const [x,z]of[[-.3,.15],[.15,-.1]]){
      box([.15,.15,.15],[x,1.16,z],CREAM,[0,x,0])
      for(let pip=0;pip<3;pip++)cylinder(.012,.004,[x+(pip-1)*.04,1.238,z+(pip-1)*.04],DARK,5)
    }
    box([2.9,.025,.025],[0,1.25,-.95],WOOD)
    chips(-1.8,.65);chips(1.15,.65)
  }
  return finish(`casino-${kind}`)
}
