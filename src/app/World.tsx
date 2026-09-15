/**
 * Draws whatever the registry holds, in order.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { useParty } from '../modules/10-party'
import { SCENE, setLobbyVisible, subscribeScene, sceneVersion } from './scene'

export function World() {
  // Re-render when the debug panel toggles a module on or off.
  useSyncExternalStore(subscribeScene, sceneVersion, sceneVersion)

  // And show or hide the lobby - see `setLobbyVisible` - as a party starts or
  // ends a game, whichever one it is.
  const party = useParty()
  useEffect(() => {
    setLobbyVisible(party.phase !== 'playing')
  }, [party.phase])

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
