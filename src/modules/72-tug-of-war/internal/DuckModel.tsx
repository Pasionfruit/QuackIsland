import { useMemo } from 'react'
import { createAvatar } from '../../02-player'
import { Mesh } from 'three'

/** The application's duck, fitted to the game's original -Z-facing pose. */
export function DuckModel({colour}:{colour:string}) {
  const avatar=useMemo(()=>{
    const made=createAvatar(colour)
    // This arena has explicit contact shadows, so skip the shared world's
    // shadow-map draws and keep the eight-player scene inside its budget.
    made.traverse(object=>{if(object instanceof Mesh)object.castShadow=false})
    return made
  },[colour])
  return <group rotation={[0,Math.PI,0]} scale={.87}><primitive object={avatar}/></group>
}
