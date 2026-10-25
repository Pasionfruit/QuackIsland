import {
  BufferGeometry, CatmullRomCurve3, Color, Float32BufferAttribute, IcosahedronGeometry,
  Matrix4, Quaternion, SphereGeometry, TorusGeometry, TubeGeometry, Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CONVENTIONS, createRng } from '../../00-core'

/** Merge vertex-coloured primitives into one draw per scenery kind. */
export function sculpt() {
  const pieces: BufferGeometry[] = []
  const add = (source: BufferGeometry, colour: string, position = new Vector3(), scale = new Vector3(1,1,1), rotation = new Quaternion()) => {
    const geometry = source.index ? source.toNonIndexed() : source.clone()
    source.dispose()
    geometry.applyMatrix4(new Matrix4().compose(position,rotation,scale))
    geometry.deleteAttribute('uv')
    const rgb = new Color(colour), count = geometry.getAttribute('position').count, values = new Float32Array(count * 3)
    for (let i=0;i<count;i++) { values[i*3]=rgb.r; values[i*3+1]=rgb.g; values[i*3+2]=rgb.b }
    geometry.setAttribute('color',new Float32BufferAttribute(values,3))
    pieces.push(geometry)
  }
  const finish = (name: string) => {
    const geometry = mergeGeometries(pieces)
    pieces.forEach(p=>p.dispose())
    if (!geometry) throw new Error(`Could not build ${name}`)
    geometry.name=name; geometry.computeBoundingBox()
    geometry.translate(0,-geometry.boundingBox!.min.y,0)
    geometry.computeBoundingBox(); geometry.computeBoundingSphere()
    return geometry
  }
  return { add, finish }
}

export function palmGeometry(): BufferGeometry {
  const { add, finish } = sculpt(), rng=createRng(CONVENTIONS.worldSeed ^ 0x46524f4e)
  const trunk = new CatmullRomCurve3([new Vector3(0,0,0),new Vector3(.15,2.4,0),new Vector3(.6,5,.1),new Vector3(1.05,7.8,.25)])
  add(new TubeGeometry(trunk,8,.23,7,false),'#90704a')
  for (let i=1;i<7;i++) {
    const at=i/8, rotation=new Quaternion().setFromUnitVectors(new Vector3(0,0,1),trunk.getTangent(at))
    add(new TorusGeometry(.235,.022,3,7),'#b49765',trunk.getPoint(at),new Vector3(1,1,1),rotation)
  }
  const crown=trunk.getPoint(1)
  add(new SphereGeometry(.35,8,4),'#839747',crown,new Vector3(1,1.2,1))
  for (let f=0;f<9;f++) {
    const angle=f/9*Math.PI*2 + rng()*.17, length=3.7+rng()*.8
    const positions: number[] = []
    const tint=new Color(['#438443','#528f46','#6b9c4a'][f%3])
    const section=(i: number, side: number) => {
      const t=i/10, reach=t*length, width=Math.sin(t*Math.PI)*.65*(i%2 ? .78 : 1)
      return new Vector3(crown.x+Math.cos(angle)*reach-Math.sin(angle)*width*side,
        crown.y+Math.sin(t*Math.PI)*1.05-t*t*1.25+(side===0 ? .09*Math.sin(t*Math.PI) : 0),
        crown.z+Math.sin(angle)*reach+Math.cos(angle)*width*side)
    }
    const triangle=(a: Vector3,b: Vector3,c: Vector3) => {
      for(const v of [a,b,c]) positions.push(v.x,v.y,v.z)
    }
    for(let i=0;i<10;i++) for(const side of [-1,1]) {
      if(i>0)triangle(section(i,0),section(i,side),section(i+1,side))
      if(i<9)triangle(section(i,0),section(i+1,side),section(i+1,0))
    }
    const leaf=new BufferGeometry()
    leaf.setAttribute('position',new Float32BufferAttribute(positions,3));leaf.computeVertexNormals()
    // The sculpt helper supplies matching vertex colours for every primitive.
    add(leaf,`#${tint.getHexString()}`)
  }
  for(let i=0;i<3;i++) {
    const a=i/3*Math.PI*2
    add(new IcosahedronGeometry(.23,0),'#735038',new Vector3(crown.x+Math.cos(a)*.28,crown.y-.28,crown.z+Math.sin(a)*.28),new Vector3(1,1.1,1))
  }
  return finish('island-palm')
}

export function grassGeometry(): BufferGeometry {
  const rng=createRng(CONVENTIONS.worldSeed ^ 0x47524153)
  const positions: number[]=[], colours: number[]=[]
  for(let tuft=0;tuft<12;tuft++) {
    const angle=rng()*Math.PI*2, radius=Math.sqrt(rng())*1.15
    const x=Math.cos(angle)*radius,z=Math.sin(angle)*radius
    for(let blade=0;blade<3;blade++) {
      const direction=rng()*Math.PI*2,height=.28+rng()*.38,width=.045+rng()*.035
      const tint=new Color(['#4c813c','#7e9c46','#94ab51'][(tuft+blade)%3])
      positions.push(x-Math.cos(direction)*width,0,z-Math.sin(direction)*width,
        x+Math.cos(direction)*width,0,z+Math.sin(direction)*width,
        x+Math.sin(direction)*height*.35,height,z-Math.cos(direction)*height*.35)
      for(let vertex=0;vertex<3;vertex++) colours.push(tint.r,tint.g,tint.b)
    }
  }
  const geometry=new BufferGeometry()
  geometry.name='island-grass-patch'
  geometry.setAttribute('position',new Float32BufferAttribute(positions,3))
  geometry.setAttribute('color',new Float32BufferAttribute(colours,3))
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere()
  return geometry
}

export function coconutGeometry(): BufferGeometry {
  const {add,finish}=sculpt()
  add(new IcosahedronGeometry(.25,0),'#806044',new Vector3(0,.24,0),new Vector3(1,.9,1.08))
  for(const [x,y] of [[-.065,.04],[.065,.04],[0,-.055]]) {
    add(new IcosahedronGeometry(.026,0),'#3d3025',new Vector3(x,.24+y,.245))
  }
  return finish('island-coconut')
}
