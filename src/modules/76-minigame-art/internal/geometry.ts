import { BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Euler, Group, IcosahedronGeometry, Matrix4, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry, TorusGeometry, Vector3 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export type Point = readonly [number, number, number]
export type Finish = 'matte' | 'metal' | 'glow'
/** Bake transforms and colours once. A dressed scene costs at most three draws. */
export class ArtBatch {
  private buckets: Record<Finish, BufferGeometry[]> = {matte:[],metal:[],glow:[]}
  private matrix = new Matrix4()
  private orientation = new Quaternion()
  private vector = new Vector3()
  private tint = new Color()
  private transform = new Matrix4()
  private parents: Matrix4[] = []
  parts = 0
  triangles = 0
  propTriangles: number[] = []
  at(point:Point, yaw:number, scale:number, build:()=>void) {
    this.parents.push(this.transform.clone())
    this.orientation.setFromAxisAngle(this.vector.set(0,1,0),yaw)
    this.matrix.compose(new Vector3(...point),this.orientation,new Vector3(scale,scale,scale))
    this.transform.multiply(this.matrix)
    const before=this.triangles
    build()
    this.propTriangles.push(this.triangles-before)
    this.transform.copy(this.parents.pop()!)
  }
  add(geometry:BufferGeometry, colour:string, point:Point=[0,0,0], scale:Point=[1,1,1], rotation:Point=[0,0,0], finish:Finish='matte') {
    // Shared normals/UV layouts are discarded before merging; every vertex owns its colour.
    const g=geometry.index?geometry.toNonIndexed():geometry.clone()
    geometry.dispose()
    const q=new Quaternion().setFromEuler(new Euler(...rotation))
    this.matrix.compose(new Vector3(...point),q,new Vector3(...scale)).premultiply(this.transform)
    g.applyMatrix4(this.matrix)
    for(const name of Object.keys(g.attributes))if(name!=='position'&&name!=='normal')g.deleteAttribute(name)
    const colours=new Float32Array(g.getAttribute('position').count*3)
    this.tint.set(colour)
    for(let i=0;i<colours.length;i+=3){colours[i]=this.tint.r;colours[i+1]=this.tint.g;colours[i+2]=this.tint.b}
    g.setAttribute('color',new BufferAttribute(colours,3))
    this.buckets[finish].push(g);this.parts++;this.triangles+=colours.length/9
  }
  box(p:Point,s:Point,c:string,rotation:Point=[0,0,0],finish:Finish='matte'){this.add(new BoxGeometry(1,1,1),c,p,s,rotation,finish)}
  ball(p:Point,s:Point,c:string,rotation:Point=[0,0,0]){this.add(new IcosahedronGeometry(1,0),c,p,s,rotation)}
  sphere(p:Point,r:number,c:string,s:Point=[1,1,1]){this.add(new SphereGeometry(r,10,6),c,p,s)}
  cylinder(p:Point,top:number,bottom:number,height:number,c:string,rotation:Point=[0,0,0],finish:Finish='matte',segments=10){this.add(new CylinderGeometry(top,bottom,height,segments),c,p,[1,1,1],rotation,finish)}
  cone(p:Point,r:number,h:number,c:string,rotation:Point=[0,0,0]){this.add(new ConeGeometry(r,h,7),c,p,[1,1,1],rotation)}
  ring(p:Point,r:number,t:number,c:string,rotation:Point=[Math.PI/2,0,0],finish:Finish='matte'){this.add(new TorusGeometry(r,t,5,16),c,p,[1,1,1],rotation,finish)}
  finish(name:string) {
    const group=new Group();group.name=name
    for(const finish of ['matte','metal','glow'] as const){
      const parts=this.buckets[finish];if(!parts.length)continue
      const geometry=mergeGeometries(parts,false)!
      parts.forEach(g=>g.dispose())
      geometry.computeBoundingSphere();geometry.computeBoundingBox()
      const material=new MeshStandardMaterial({vertexColors:true,roughness:finish==='metal'?.4:.86,metalness:finish==='metal'?.65:0,
        emissive:finish==='glow'?'#ffffff':'#000000',emissiveIntensity:finish==='glow'?.7:0})
      const mesh=new Mesh(geometry,material);mesh.name=`art-${finish}`;mesh.receiveShadow=true
      // Decorative pieces do not intercept game aiming/picking rays.
      mesh.raycast=()=>{}
      group.add(mesh)
    }
    group.userData.art={parts:this.parts,triangles:this.triangles,propTriangles:this.propTriangles,drawCalls:group.children.length}
    return group
  }
}

export function disposeArt(group:Group){
  group.traverse(object=>{if(object instanceof Mesh){object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach(m=>m.dispose())}})
}
