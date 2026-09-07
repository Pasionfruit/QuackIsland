/**
 * Who is driving the camera.
 *
 * There is one camera, so two modules both moving it would fight every frame.
 * A module that wants it sets the mode to 'player' and the built-in debug orbit
 * stands down; set it back to 'orbit' to inspect the world by hand again.
 */
import { createStore, useStore } from './store'

export type CameraMode = 'orbit' | 'player'

const store = createStore<CameraMode>('orbit')

export function setCameraMode(next: CameraMode): void {
  store.set(next)
}

export function getCameraMode(): CameraMode {
  return store.get()
}

export function useCameraMode(): CameraMode {
  return useStore(store)
}
