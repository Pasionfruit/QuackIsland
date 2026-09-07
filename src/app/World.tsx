/**
 * Draws whatever the registry holds, in order.
 */
import { useSyncExternalStore } from 'react'
import { SCENE, subscribeScene, sceneVersion } from './scene'

export function World() {
  // Re-render when the debug panel toggles a module on or off.
  useSyncExternalStore(subscribeScene, sceneVersion, sceneVersion)
  return (
    <>
      {SCENE.filter((e) => e.enabled)
        .sort((a, b) => a.order - b.order)
        .map(({ id, Component }) => (
          <Component key={id} />
        ))}
    </>
  )
}
