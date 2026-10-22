import { AmbientLight, CircleGeometry, Color, DirectionalLight, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, WebGLRenderer } from 'three'
import { createAvatar } from '../../02-player'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { GameCanvas } from '../../00-core'
import { RopeScene } from '../internal/RopeScene'
import { createRound } from '../internal/rules'

/** Static eight-player art fixture; no network/gameplay result is exercised. */
export function renderFullTeamStudy() {
  const host=document.createElement('div')
  host.style.cssText='position:fixed;inset:0;z-index:9999;background:#f8f1df'
  document.body.appendChild(host)
  const round=createRound(91,Array.from({length:8},(_,i)=>({id:`review-${i}`,mine:i===0,bot:false})),'review-0')
  createRoot(host).render(createElement(GameCanvas,null,createElement(RopeScene,{round,advance:()=>{}})))
}

/** Close-up review render of the exact meshes used by the game. */
export function renderDuckStudy() {
  const renderer = new WebGLRenderer({antialias:true})
  renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(devicePixelRatio)
  renderer.domElement.style.cssText='position:fixed;inset:0;z-index:10000'
  document.body.appendChild(renderer.domElement)
  const scene=new Scene();scene.background=new Color('#f8f1df')
  scene.add(new AmbientLight('#fff7e1',2))
  const sun=new DirectionalLight('#ffffff',3);sun.position.set(-3,6,-4);scene.add(sun)
  const fill=new DirectionalLight('#acd9df',1.3);fill.position.set(4,2,3);scene.add(fill)
  const camera=new PerspectiveCamera(33,innerWidth/innerHeight,.1,50)
  camera.position.set(1,3.5,-8.7);camera.lookAt(0,.7,0)
  const geometries=[]
  for(const [i,colour] of ['#dbb469','#73a9ad','#d69383'].entries()) {
    const duck=createAvatar(colour),group=new Group()
    group.add(duck);group.position.x=(i-1)*2;group.rotation.y=[-.8,0,2.1][i]+Math.PI
    const shadow=new Mesh(new CircleGeometry(.7,24),new MeshBasicMaterial({color:'#9d9983',transparent:true,opacity:.2,depthWrite:false}))
    shadow.rotation.x=-Math.PI/2;shadow.position.y=.01;shadow.scale.y=1.2;group.add(shadow);scene.add(group)
    let triangles=0,finite=true
    duck.traverse(object=>{if(object instanceof Mesh){const positions=object.geometry.getAttribute('position');triangles+=(object.geometry.index?.count??positions.count)/3;finite&&=Array.from(positions.array).every(Number.isFinite)}})
    geometries.push({colour,triangles,finite})
  }
  renderer.render(scene,camera)
  return {geometries,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles}
}
