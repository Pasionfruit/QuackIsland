/**
 * The two ends of a shared race.
 *
 * The **host** runs everything - the clock, the choosing, the countdown, every
 * animal, every treat and the line - from its own hands, the stand-ins' and the
 * guests' as they arrive, and sends it fifteen times a second. A **guest**
 * sends its hands and its pick and shows what the host sends.
 *
 * The cost is that a guest's own animal answers its keys a round trip late. The
 * screen eases every body towards where the host has it, so it glides rather
 * than jumps - and because an animal here has momentum anyway, a few frames of
 * lag reads as the animal being heavy rather than as the controls being broken.
 *
 * The same lessons as the other minigames: a guest keeps listening after the
 * race ends; somebody who leaves the lobby stops where they are; pausing in a
 * lobby stops only your own hands. Alone, the clock stops.
 */
import { useEffect, useRef } from 'react'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { botChoose, botDrive } from './ai'
import { choose, leave, stepGame, type Game, type Hands } from './rules'
import { myId } from './setup'
import type { PetId } from './pets'
import { applySnapshot, decodeHands, decodeSnapshot, encodeHands, encodeSnapshot, type HandsMessage, type Snapshot } from './wire'

const SEND_MS = 66
const HANDS_MS = 50
/** Past this far apart, a guest's clock jumps to the host's rather than easing. */
const SNAP_SECONDS = 0.4

/** What this browser is doing this frame: where the keys point, whether boost is held, and what it has picked. */
export interface Press {
  hands: Hands
  pet: PetId | null
}

export interface RaceNet {
  advance(game: Game, dt: number, press: Press, paused: boolean): boolean
}

export function useRaceNet(): RaceNet {
  const heard = useRef<({ from: string } & HandsMessage)[]>([])
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const handsAt = useRef(0)
  const mine = useRef<{ x: number; z: number; boost: boolean; pet: PetId | null }>({ x: 0, z: 0, boost: false, pet: null })

  useEffect(() => {
    return subscribeRoom((from, raw) => {
      if (getNet().host) {
        const said = decodeHands(raw)
        if (said) heard.current.push({ from, ...said })
        return
      }
      const snap = decodeSnapshot(raw)
      if (snap) latest.current = { snap, at: performance.now() }
    })
  }, [])

  const advance = (game: Game, dt: number, press: Press, paused: boolean) => {
    const net = getNet()
    const now = performance.now()

    if (net.host) {
      if (game.racers.length === 0) return false
      const shared = net.status === 'joined' && net.peers > 0
      if (paused && !shared) return false

      const me = game.racers.findIndex((r) => r.mine)
      if (me >= 0) {
        game.hands[me] = paused ? { x: 0, z: 0, boost: false } : press.hands
        if (!paused && press.pet) choose(game, me, press.pet)
      }
      botChoose(game)
      for (const said of heard.current.splice(0)) {
        const index = game.racers.findIndex((r) => r.id === said.from)
        if (index < 0 || said.game !== game.id) continue
        game.hands[index] = { x: said.x, z: said.z, boost: said.boost }
        // The pick rides on every message, so the newest one wins - which is
        // exactly what changing your mind at the table should do.
        if (said.pet) choose(game, index, said.pet)
      }
      botDrive(game)
      if (net.status === 'joined') {
        const here = new Set(getPeers().map((p) => p.id))
        game.racers.forEach((racer, index) => {
          if (!racer.bot && !racer.mine && !racer.left && !here.has(racer.id)) leave(game, index)
        })
      }
      stepGame(game, dt)
      if (net.status === 'joined' && now - sentAt.current >= SEND_MS) {
        sentAt.current = now
        sendToRoom(encodeSnapshot(game))
      }
      return true
    }

    // A guest: the host's word, the clock, and our hands sent.
    const heardFrom = latest.current
    const before = game.id
    if (heardFrom && heardFrom.snap !== applied.current) {
      applied.current = heardFrom.snap
      applySnapshot(game, heardFrom.snap, myId())
    }
    if (game.racers.length === 0) return false
    if (heardFrom && !game.over) {
      const step = Math.min(Math.max(dt, 0), 0.25)
      const hostElapsed = heardFrom.snap.elapsed + (now - heardFrom.at) / 1000
      const ours = game.elapsed + step
      game.elapsed = before !== game.id || Math.abs(hostElapsed - ours) > SNAP_SECONDS ? hostElapsed : ours + (hostElapsed - ours) * Math.min(1, step * 4)
    }

    const hands = paused ? { x: 0, z: 0, boost: false } : press.hands
    const m = mine.current
    // Our own pick is shown on our own table at once; the host's snapshot
    // confirms it a round trip later, and says the same thing.
    if (!paused && press.pet) {
      m.pet = press.pet
      const seat = game.racers.findIndex((r) => r.mine)
      if (seat >= 0) choose(game, seat, press.pet)
    }
    const moved = Math.abs(hands.x - m.x) > 0.01 || Math.abs(hands.z - m.z) > 0.01 || hands.boost !== m.boost
    if (!game.over && (moved || now - handsAt.current >= HANDS_MS)) {
      handsAt.current = now
      m.x = hands.x
      m.z = hands.z
      m.boost = hands.boost
      sendToRoom(encodeHands({ game: game.id, x: hands.x, z: hands.z, boost: hands.boost, pet: m.pet }))
    }
    return true
  }

  return { advance }
}
