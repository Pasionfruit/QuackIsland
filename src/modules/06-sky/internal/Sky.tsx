/**
 * The sky, as one thing the registry can switch on and off.
 *
 * The dome and the precipitation are separate meshes with nothing in common
 * but the weather they read, so this is only here to save the composition root
 * knowing there are two of them.
 */
import { Precipitation } from './Precipitation'
import { SkyDome } from './SkyDome'

export function Sky() {
  return (
    <>
      <SkyDome />
      <Precipitation />
    </>
  )
}
