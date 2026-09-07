/**
 * Draws whatever the registry holds, in order.
 */
import { SCENE } from './scene'

export function World() {
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
