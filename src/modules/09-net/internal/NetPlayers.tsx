/**
 * Sending your body, and drawing everyone else's.
 *
 * Two jobs that both want to happen once a frame with no React in the way:
 * the local player's state goes into the send buffer, and every peer's
 * interpolated state goes onto a body of their own.
 *
 * The bodies come out of `02-player`'s own builder, so a remote player is the
 * same shape, the same size and the same way up as the local one, and changing
 * how a body looks changes all of them at once.
 */
import { useEffect, useMemo, useRef } from 'react'
import { Group } from 'three'
import { PRIORITY, useGameFrame } from '../../00-core'
import { PLAYER, bodyPose, createAvatar, getPlayerState } from '../../02-player'
import { addWalker as addPrintWalker, removeWalker as removePrintWalker } from '../../03-footprints'
import { addWalker as addSoundWalker, removeWalker as removeSoundWalker } from '../../08-audio'
import { followWorld, peerAt, peerTracks, publish, sweep } from './client'

/** One remote body: an outer group that faces, an inner one that tips. */
interface Rig {
  root: Group
  tilt: Group
  /** Holds the body, so a peer who changes colour can be repainted in place. */
  feet: Group
  colour: string | null
}

/**
 * Where each peer is *this frame*, so the footprint and sound modules can read
 * it without either of them knowing a network exists.
 *
 * Written once a frame here and read by both registries through a closure.
 * They ask for a walker; they get whatever was last interpolated.
 */
interface PeerWalker {
  x: number
  y: number
  z: number
  vy: number
  facing: number
  grounded: boolean
  swimming: boolean
  speed: number
}

const peerWalkers = new Map<string, PeerWalker>()

export function NetPlayers() {
  const holder = useRef<Group>(null)
  /** A rig per peer id, made when they first appear and thrown away when gone. */
  const rigs = useMemo(() => new Map<string, Rig>(), [])

  // Rigs are three.js objects, not React children: peers come and go on the
  // network's schedule, and rebuilding a React tree for that would be a
  // re-render every time somebody joined.
  useEffect(() => {
    const parent = holder.current
    return () => {
      if (!parent) return
      for (const rig of rigs.values()) parent.remove(rig.root)
      rigs.clear()
      // The registries outlive this component, so they have to be cleared or a
      // switched-off net module leaves ghosts leaving footprints.
      for (const id of peerWalkers.keys()) {
        removePrintWalker(id)
        removeSoundWalker(id)
      }
      peerWalkers.clear()
    }
  }, [rigs])

  useGameFrame((_frame, delta) => {
    const now = performance.now() / 1000

    // A guest follows the host's clock and weather; the host does nothing here.
    followWorld(delta)

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
    if (!parent) return

    const seen = peerTracks()

    // Retire anyone who has gone, from all three places they are known.
    for (const [id, rig] of rigs) {
      if (seen.has(id)) continue
      parent.remove(rig.root)
      rigs.delete(id)
    }
    for (const id of peerWalkers.keys()) {
      if (seen.has(id)) continue
      peerWalkers.delete(id)
      removePrintWalker(id)
      removeSoundWalker(id)
    }

    for (const id of seen.keys()) {
      const state = peerAt(id, now)
      if (!state) continue

      // A peer with an interpolated position walks, leaves prints and makes a
      // noise. Registered once, on the frame they first have a position.
      let there = peerWalkers.get(id)
      if (!there) {
        there = { x: 0, y: 0, z: 0, vy: 0, facing: 0, grounded: true, swimming: false, speed: 0 }
        peerWalkers.set(id, there)
        addPrintWalker(id, () => peerWalkers.get(id) ?? null)
        addSoundWalker(id, () => peerWalkers.get(id) ?? null)
      }
      there.x = state.x
      there.y = state.y
      there.z = state.z
      there.facing = state.facing
      there.speed = state.speed
      there.swimming = state.swimming
      // Remote players are not simulated, so there is no fall to report. A peer
      // is on the ground whenever they are not swimming, which is what makes
      // their footsteps fire and stops a phantom landing thud on arrival.
      there.grounded = !state.swimming
      there.vy = 0

      const colour = seen.get(id)?.colour ?? null
      let rig = rigs.get(id)
      if (rig && rig.colour !== colour) {
        // They picked a new colour in settings: swap the body, keep the rig.
        rig.feet.clear()
        rig.feet.add(createAvatar(colour ?? undefined))
        rig.colour = colour
      }
      if (!rig) {
        const root = new Group()
        const tilt = new Group()
        // The same offset the local player uses: a body's origin is its feet,
        // and the middle of it is what should pivot.
        const feet = new Group()
        feet.position.y = -PLAYER.height / 2
        feet.add(createAvatar(colour ?? undefined))
        tilt.add(feet)
        root.add(tilt)
        parent.add(root)
        rig = { root, tilt, feet, colour }
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
