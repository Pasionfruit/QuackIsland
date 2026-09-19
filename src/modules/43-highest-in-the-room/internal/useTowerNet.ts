/**
 * The two ends of a shared room.
 *
 * The **host** runs the game - the clock, its own keys, the stand-ins', the
 * guests' as they arrive, who is knocked out and the end - and sends it fifteen
 * times a second. A **guest** judges its own keys on its own screen, so a tower
 * grows the instant the key goes down, and sends each one as it presses it. The
 * host presses the same key on the same arrow and gets the same answer.
 *
 * Nobody is knocked out until the host says so. The same lessons as the other
 * minigames: a guest keeps listening after the game ends; somebody who leaves
 * the lobby is out; a pause stops the round for everybody.
 */
import { useEffect, useRef } from 'react'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { botSteer } from './ai'
import { judgeEnd, knockOut, leave, press, tick, type Arrow, type Game } from './rules'
import { myId } from './setup'
import { applySnapshot, decodePress, decodeSnapshot, encodePress, encodeSnapshot, type Snapshot } from './wire'

const SEND_MS = 66
/** Past this far apart, a guest's clock jumps to the host's rather than easing. */
const SNAP_SECONDS = 0.4
/** How long after its last key a guest trusts its own tower over the host's, ms. */
const HOLD_MS = 1000

export interface Climbed {
  changed: boolean
  /** Your own keys this frame: true for each right, false for each wrong. */
  pressed: boolean[]
}

export interface TowerNet {
  advance(game: Game, dt: number, keys: Arrow[], paused: boolean): Climbed
}

export function useTowerNet(): TowerNet {
  const heard = useRef<{ from: string; game: number; n: number; arrow: Arrow }[]>([])
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const pressedAt = useRef(-Infinity)

  useEffect(() => {
    return subscribeRoom((from, raw) => {
      if (getNet().host) {
        const said = decodePress(raw)
        if (said) heard.current.push({ from, ...said })
        return
      }
      const snap = decodeSnapshot(raw)
      if (snap) latest.current = { snap, at: performance.now() }
    })
  }, [])

  /** Your keys, on your own tower: the same on the host and on a guest, but for who is told. */
  const mine = (game: Game, keys: Arrow[], host: boolean): boolean[] => {
    const me = game.players.findIndex((p) => p.mine)
    const out: boolean[] = []
    if (me < 0) return out
    for (const arrow of keys) {
      const n = game.players[me].inputs
      const ok = press(game, me, arrow)
      if (ok === null) continue
      out.push(ok)
      pressedAt.current = performance.now()
      if (!host) sendToRoom(encodePress(game.id, n, arrow))
    }
    return out
  }

  const advance = (game: Game, dt: number, keys: Arrow[], paused: boolean): Climbed => {
    const net = getNet()
    const now = performance.now()
    // A pause is shared: whoever pressed it stopped the round for everybody.
    if (paused) return { changed: false, pressed: [] }

    if (net.host) {
      if (game.players.length === 0) return { changed: false, pressed: [] }
      tick(game, dt)
      const pressed = mine(game, keys, true)
      botSteer(game)
      for (const said of heard.current.splice(0)) {
        const player = game.players.findIndex((p) => p.id === said.from)
        const p = game.players[player]
        // In order, each once: an old number is a key already pressed.
        if (!p || said.game !== game.id || said.n < p.inputs) continue
        press(game, player, said.arrow)
      }
      if (net.status === 'joined') {
        const here = new Set(getPeers().map((p) => p.id))
        game.players.forEach((p, index) => {
          if (!p.bot && !p.mine && !p.left && !here.has(p.id)) leave(game, index)
        })
      }
      knockOut(game)
      judgeEnd(game)
      if (net.status === 'joined' && now - sentAt.current >= SEND_MS) {
        sentAt.current = now
        sendToRoom(encodeSnapshot(game))
      }
      return { changed: true, pressed }
    }

    // A guest. The host's word first, then the clock, then our own keys.
    const heardFrom = latest.current
    const before = game.id
    if (heardFrom && heardFrom.snap !== applied.current) {
      applied.current = heardFrom.snap
      applySnapshot(game, heardFrom.snap, myId(), now - pressedAt.current < HOLD_MS)
    }
    if (game.players.length === 0) return { changed: false, pressed: [] }
    tick(game, dt)
    if (heardFrom && !game.over) {
      const hostElapsed = heardFrom.snap.elapsed + (now - heardFrom.at) / 1000
      const ours = game.elapsed
      game.elapsed =
        before !== game.id || Math.abs(hostElapsed - ours) > SNAP_SECONDS ? hostElapsed : ours + (hostElapsed - ours) * Math.min(1, Math.min(Math.max(dt, 0), 0.25) * 4)
    }
    return { changed: true, pressed: mine(game, keys, false) }
  }

  return { advance }
}
