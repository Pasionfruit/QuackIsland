import { AmbientLight, Color, DirectionalLight, GridHelper, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, WebGLRenderer } from 'three'
import { createAvatar } from '../index'

const canvas=document.getElementById('review') as HTMLCanvasElement
const renderer=new WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true
const views=[['#e8b44d',9.5],['#76a9ac',17],['#c88d89',7],['#a5b56a',0]].map(([colour,speed])=>{
  const scene=new Scene();scene.background=new Color('#142329');scene.add(new AmbientLight('#ffffff',2))
  const sun=new DirectionalLight('#ffe4ba',3);sun.position.set(3,7,4);sun.castShadow=true;scene.add(sun)
  scene.add(sun.target)
  const actor=new Group();actor.add(createAvatar(colour as string));scene.add(actor)
  const floor=new Mesh(new PlaneGeometry(80,80),new MeshStandardMaterial({color:'#9e9a7b',roughness:1}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor)
  const grid=new GridHelper(80,40,'#8b8c73','#a5a38a');grid.position.y=.005;scene.add(grid)
  const camera=new PerspectiveCamera(34,1,.1,100)
  return {scene,actor,floor,grid,camera,sun,speed:speed as number}
})
const start=performance.now()
function render(){
  const width=canvas.clientWidth,height=canvas.clientHeight
  if(canvas.width!==Math.floor(width*renderer.getPixelRatio())||canvas.height!==Math.floor(height*renderer.getPixelRatio()))renderer.setSize(width,height,false)
  const time=(performance.now()-start)/1000,viewWidth=width/4
  renderer.setScissorTest(true)
  views.forEach((view,i)=>{
    view.actor.position.z=-view.speed*time
    const jump=time%1.6
    view.actor.position.y=i===2?Math.max(0,11*jump-13*jump*jump):0
    view.actor.rotation.y=Math.PI
    view.floor.position.z=view.actor.position.z;view.grid.position.z=Math.floor(view.actor.position.z/2)*2
    view.sun.position.z=view.actor.position.z+4;view.sun.target.position.z=view.actor.position.z
    view.camera.position.set(3,3.2,view.actor.position.z+7);view.camera.lookAt(0,.85,view.actor.position.z)
    view.camera.aspect=viewWidth/height;view.camera.updateProjectionMatrix()
    renderer.setViewport(i*viewWidth,0,viewWidth,height);renderer.setScissor(i*viewWidth,0,viewWidth,height)
    renderer.render(view.scene,view.camera)
  })
  requestAnimationFrame(render)
}
render()
