/**
 * Sending your duck, and drawing everyone else's.
 *
 * Two jobs that both want to happen once a frame with no React in the way:
 * the local duck's state goes into the send buffer, and every peer's
 * interpolated state goes onto a cloned duck.
 *
 * The ducks are clones of the one `02-player` already loaded and normalised,
 * so a remote player is the same model, the same size and the same way up as
 * the local one, and repairing the feet or changing the scale fixes them all.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Group } from 'three'
import { PRIORITY, useGameFrame } from '../../00-core'
import { PLAYER, bodyPose, getPlayerState, loadDuck } from '../../02-player'
import { peerAt, peerTracks, publish, sweep } from './client'

/** One remote duck: an outer group that faces, an inner one that tips. */
interface Rig {
  root: Group
  tilt: Group
}

export function NetPlayers() {
  const [model, setModel] = useState<Group | null>(null)
  const holder = useRef<Group>(null)
  /** A rig per peer id, made when they first appear and thrown away when gone. */
  const rigs = useMemo(() => new Map<string, Rig>(), [])

  useEffect(() => {
    let live = true
    loadDuck()
      .then((duck) => {
        if (live) setModel(duck)
      })
      .catch((error) => {
        console.error('[09-net] no duck to draw other players with', error)
      })
    return () => {
      live = false
    }
  }, [])

  // Rigs are three.js objects, not React children: peers come and go on the
  // network's schedule, and rebuilding a React tree for that would be a
  // re-render every time somebody joined.
  useEffect(() => {
    const parent = holder.current
    return () => {
      if (!parent) return
      for (const rig of rigs.values()) parent.remove(rig.root)
      rigs.clear()
    }
  }, [rigs])

  useGameFrame(() => {
    const now = performance.now() / 1000

    // Send ours.
    const me = getPlayerState()
    if (me) {
      publish({
        x: me.x,
        y: me.y,
        z: me.z,
        facing: me.facing,
        lean: me.lean,
        swimming: me.swimming,
        speed: me.speed,
      })
    }

    sweep(now)

    const parent = holder.current
    if (!parent || !model) return

    const seen = peerTracks()

    // Retire anyone who has gone.
    for (const [id, rig] of rigs) {
      if (seen.has(id)) continue
      parent.remove(rig.root)
      rigs.delete(id)
    }

    for (const id of seen.keys()) {
      const state = peerAt(id, now)
      if (!state) continue

      let rig = rigs.get(id)
      if (!rig) {
        const root = new Group()
        const tilt = new Group()
        // The same offset the local duck uses: the model's origin is its feet,
        // and the middle of the body is what should pivot.
        const feet = new Group()
        feet.position.y = -PLAYER.height / 2
        feet.add(model.clone())
        tilt.add(feet)
        root.add(tilt)
        parent.add(root)
        rig = { root, tilt }
        rigs.set(id, rig)
      }

      const { rise, tip } = bodyPose(state.lean, PLAYER.height, PLAYER.radius)
      rig.root.position.set(state.x, state.y + rise, state.z)
      rig.root.rotation.y = state.facing
      rig.tilt.rotation.x = tip * (Math.PI / 2)
    }
  }, PRIORITY.camera)

  return <group ref={holder} />
}
