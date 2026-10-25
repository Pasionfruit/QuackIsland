import { memo, useEffect, useMemo } from 'react'
import { BoxGeometry } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

/** Small edge highlights, with the original box's outer dimensions and centre. */
export function createBeveledBox(width=1,height=1,depth=1) {
  // A few games intentionally collapse a box during reveal/fall animations.
  // Keep their degenerate or mirrored shape instead of feeding it to the bevel generator.
  if(![width,height,depth].every(v=>Number.isFinite(v)&&v>0))return new BoxGeometry(width,height,depth)
  const radius=Math.min(.055,Math.min(width,height,depth)*.12)
  return new RoundedBoxGeometry(width,height,depth,1,radius)
}
export const BeveledBox=memo(function BeveledBox({args=[]}:{args?:readonly (number|undefined)[]}){
  const [width=1,height=1,depth=1]=args
  const geometry=useMemo(()=>createBeveledBox(width,height,depth),[width,height,depth])
  useEffect(()=>()=>geometry.dispose(),[geometry])
  return <primitive object={geometry} attach="geometry"/>
})
