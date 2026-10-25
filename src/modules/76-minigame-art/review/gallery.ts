import { AmbientLight, Color, DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, WebGLRenderer, type Group } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { ART_DIRECTIONS, createMinigameArt, disposeArt, type MinigameArtId } from '..'
const renderer=new WebGLRenderer({canvas:document.querySelector<HTMLCanvasElement>('#view')!,antialias:true})
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true
const scene=new Scene();scene.background=new Color('#adc5c0')
const camera=new PerspectiveCamera(40,1,.1,160);camera.position.set(18,15,21)
const orbit=new OrbitControls(camera,renderer.domElement);orbit.target.set(0,1,-1);orbit.enableDamping=true
scene.add(new AmbientLight('#fff7e2',.65),new HemisphereLight('#d0e4ed','#756d52',2))
const sun=new DirectionalLight('#fff0ce',3);sun.position.set(-8,15,10);scene.add(sun)
const floor=new Mesh(new PlaneGeometry(10.4,6),new MeshStandardMaterial({color:'#8ca49c',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.05;floor.receiveShadow=true;scene.add(floor)
const select=document.querySelector<HTMLSelectElement>('#game')!
let current:Group|undefined
for(const [id,direction] of Object.entries(ART_DIRECTIONS)){const option=document.createElement('option');option.value=id;option.textContent=id.replace(/-/g,' ');select.add(option);option.title=direction.name}
function change(){
  if(current){scene.remove(current);disposeArt(current)}
  const game=select.value as MinigameArtId,direction=ART_DIRECTIONS[game]
  current=createMinigameArt(game,{halfWidth:5.2,halfDepth:3,center:[0,0,0],scale:1});scene.add(current)
  document.querySelector('#title')!.textContent=direction.name
  document.querySelector('#props')!.textContent=direction.props.map(p=>p.replace(/-/g,' ')).join(' · ')
  document.querySelector('#stats')!.textContent=`${current.userData.art.triangles.toLocaleString()} triangles · ${current.userData.art.drawCalls} draws · no textures`
  floor.material.color.set(direction.palette.base)
  history.replaceState(null,'',`#${game}`)
}
select.value=location.hash.slice(1) in ART_DIRECTIONS?location.hash.slice(1):'zombie-tag';select.addEventListener('change',change);change()
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()}
addEventListener('resize',resize);resize()
renderer.setAnimationLoop(()=>{orbit.update();renderer.render(scene,camera)})
addEventListener('pagehide',()=>{renderer.setAnimationLoop(null);if(current)disposeArt(current);floor.geometry.dispose();floor.material.dispose();orbit.dispose();renderer.dispose()},{once:true})
