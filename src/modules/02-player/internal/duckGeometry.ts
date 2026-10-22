import { BufferGeometry, Color, CylinderGeometry, Euler, ExtrudeGeometry, Float32BufferAttribute, Matrix4, Quaternion, Shape, SphereGeometry, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { FaceEmote } from './emote'

/** Coloured primitives are baked into one geometry per moving part. */
function sculpt() {
  const pieces: BufferGeometry[] = []
  function add(geometry: BufferGeometry, tint: Color|string, position: [number,number,number], scale: [number,number,number]=[1,1,1], rotation: [number,number,number]=[0,0,0]) {
    const made=geometry.index ? geometry.toNonIndexed() : geometry.clone()
    geometry.dispose()
    made.applyMatrix4(new Matrix4().compose(new Vector3(...position),new Quaternion().setFromEuler(new Euler(...rotation)),new Vector3(...scale)))
    made.deleteAttribute('uv')
    const colour=new Color(tint), count=made.getAttribute('position').count
    const rgb=new Float32Array(count*3)
    for(let i=0;i<count;i++){rgb[i*3]=colour.r;rgb[i*3+1]=colour.g;rgb[i*3+2]=colour.b}
    made.setAttribute('color',new Float32BufferAttribute(rgb,3));pieces.push(made)
  }
  function oval(tint: Color|string, position: [number,number,number], scale: [number,number,number], rotation: [number,number,number]=[0,0,0], segments=8,rings=5) {
    add(new SphereGeometry(1,segments,rings),tint,position,scale,rotation)
  }
  function finish(name:string) {
    const geometry=mergeGeometries(pieces)
    pieces.forEach(piece=>piece.dispose())
    if(!geometry)throw new Error(`Could not build ${name}`)
    geometry.name=name;geometry.computeBoundingBox();geometry.computeBoundingSphere()
    return geometry
  }
  return {add,oval,finish}
}

/** Feet at zero, face toward +Z; controller dimensions and head pivot stay stable. */
export function duckBody(colour:string):BufferGeometry {
  const {add,oval,finish}=sculpt(), body=new Color(colour)
  const wing=body.clone().multiplyScalar(.78), feather=body.clone().lerp(new Color('#fff4d6'),.22)
  oval(body,[0,.64,-.05],[.43,.46,.58],[0,0,0],10,7)
  oval('#fff0cc',[0,.7,.36],[.33,.34,.23],[0,0,0],10,6)
  oval(body,[0,1.06,.3],[.23,.35,.25],[.18,0,0],10,6)
  for(const side of [-1,1]) {
    oval(wing,[side*.37,.72,-.02],[.145,.28,.43],[.24,0,side*.18],8,5)
    for(let i=0;i<3;i++)oval(i%2 ? feather : wing,[side*(.425-i*.025),.62+i*.075,.21+i*.065],[.075,.105,.22],[.38,-side*.15,0],6,3)
    add(new CylinderGeometry(.05,.065,.2,6),'#e69435',[side*.21,.17,.08])
    const foot=new Shape()
    const outline=[[-.08,-.1],[.08,-.1],[.12,.04],[.205,.25],[.12,.3],[.055,.255],[0,.34],[-.055,.255],[-.145,.3],[-.2,.235],[-.1,.04]]
    outline.forEach(([x,z],i)=>i ? foot.lineTo(x,z) : foot.moveTo(x,z));foot.closePath()
    add(new ExtrudeGeometry(foot,{depth:.06,bevelEnabled:false}),'#ed9b36',[side*.22,.06,.08],[1,1,1],[Math.PI/2,0,0])
  }
  for(const i of [-1,0,1])oval(i===0 ? feather : wing,[i*.13,.83,-.62],[.13,.12,.32],[.48,-i*.2,0],6,3)
  return finish('duck-body')
}

export function duckHead(colour:string):BufferGeometry {
  const {oval,finish}=sculpt()
  oval(colour,[0,0,0],[.34,.4,.34],[0,0,0],12,8)
  return finish('duck-head')
}

/** One shared bill/eyes mesh per emote, attached to the movable head. */
export function duckExpression(emote:FaceEmote):BufferGeometry {
  const {oval,finish}=sculpt(), ink='#243e40'
  const open=emote==='laugh' ? .13 : emote==='surprised' || emote==='scared' ? .08 : .012
  oval('#9f592d',[0,-.15-open*.5,.4],[.255,.022+open*.55,.26],[0,0,0],8,4)
  oval('#e99332',[0,-.17-open,.4],[.25,.035,.255],[0,0,0],8,4)
  oval('#f4b54b',[0,-.105,.4],[.265,.065,.28],[0,0,0],10,5)
  for(const side of [-1,1]) {
    oval('#a56731',[side*.085,-.052,.44],[.017,.01,.025],[0,0,0],4,3)
    const wide=emote==='scared' || emote==='surprised'
    const narrow=emote==='mad' || emote==='mog'
    oval('#fffbe9',[side*.27,.08,.185],[.075,wide ? .105 : .085,.066],[0,side*.2,0],8,5)
    if(emote==='laugh') {
      for(let i=0;i<3;i++)oval(ink,[side*.29+(i-1)*.022,.08+(i===1 ? .013 : 0),.244],[.018,.014,.015],[0,0,0],5,3)
    } else {
      oval(ink,[side*.29,.085,.23],[.044,narrow ? .03 : wide ? .068 : .058,.035],[0,side*.25,narrow ? side*.18 : 0],6,4)
      oval('#ffffff',[side*.288,.105,.259],[.012,.015,.009],[0,0,0],4,3)
    }
    if(emote==='mad' || emote==='mog' || emote==='sad' || emote==='scared') {
      oval(ink,[side*.27,.2,.2],[.078,.015,.019],[0,side*.25,emote==='mad' ? side*.4 : emote==='sad' ? -side*.35 : -side*.12],6,4)
    }
  }
  return finish(`duck-face-${emote}`)
}
