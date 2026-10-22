import { _roots } from '@react-three/fiber'
import { Box3, Mesh, Vector3 } from 'three'

/** Read-only browser diagnostic of the actual mounted R3F scenes. */
export function sceneReport() {
  return [..._roots.values()].map(root=>{
    const {scene,gl}=root.store.getState()
    scene.updateMatrixWorld(true)
    const avatars: {duck:boolean;visible:boolean;position:number[];bounds:number[];triangles:number;head:number[];face:string|undefined}[]=[]
    scene.traverse(object=>{
      if(object.name!=='avatar')return
      let visible=true,ancestor:typeof object|null=object
      while(ancestor){visible&&=ancestor.visible;ancestor=ancestor.parent}
      let triangles=0
      object.traverse(child=>{if(child instanceof Mesh)triangles+=(child.geometry.index?.count??child.geometry.getAttribute('position').count)/3})
      const bounds=new Box3().setFromObject(object),head=object.getObjectByName('avatar-head')
      const face=object.getObjectByName('avatar-face') as Mesh|undefined
      avatars.push({duck:object.getObjectByName('duck-body') instanceof Mesh,visible,position:object.getWorldPosition(new Vector3()).toArray(),bounds:[...bounds.min.toArray(),...bounds.max.toArray()],triangles,head:head?[head.rotation.x,head.rotation.y]:[],face:face?.geometry.name})
    })
    return {avatars,render:{calls:gl.info.render.calls,triangles:gl.info.render.triangles}}
  })
}
