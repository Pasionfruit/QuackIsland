/**
 * The two ends of a shared floor.
 *
 * The **host** runs everything - the clock, the music, every body, every push
 * and every chair - from its own hands, the stand-ins', and the guests' as they
 * arrive, and sends it fifteen times a second. A **guest** sends its hands and
 * shows what the host sends: when bodies knock each other about, there can only
 * be one answer to where everybody is.
 *
 * The cost is that a guest's own body answers its keys a round trip late. On a
 * relay in the same town that is a few frames; the screen eases every body
 * towards where the host has it, so it glides rather than jumps.
 *
 * The same lessons as the other minigames: a guest keeps listening after the
 * game ends; somebody who leaves the lobby is out; pausing in a lobby stops only
 * your hands. Alone, the clock stops.
 */
import { useEffect, useRef } from 'react'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { botPlay } from './ai'
import { canAct, leave, push, sit, stepGame, type Game, type Hands } from './rules'
import { applySnapshot, decodeHands, decodeSnapshot, encodeHands, encodeSnapshot, type HandsMessage, type Snapshot } from './wire'
import { myId } from './setup'

const SEND_MS = 66
const HANDS_MS = 50
/** Past this far apart, a guest's clock jumps to the host's rather than easing. */
const SNAP_SECONDS = 0.4

/** What your hands did this frame: where the keys point, and whether sit and push were pressed. */
export interface Press {
  hands: Hands
  sit: boolean
  push: boolean
}

export interface MayhemNet {
  advance(game: Game, dt: number, press: Press, paused: boolean): boolean
}

export function useMayhemNet(): MayhemNet {
  const heard = useRef<({ from: string } & HandsMessage)[]>([])
  const counted = useRef(new Map<string, { sits: number; pushes: number }>())
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const handsAt = useRef(0)
  const mine = useRef({ sits: 0, pushes: 0, x: 0, z: 0 })

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

  /** A press, turning first to where the keys point, so a push goes the way you mean it to. */
  const act = (game: Game, index: number, hands: Hands, sits: boolean, pushes: boolean) => {
    const p = game.players[index]
    game.hands[index] = hands
    if (!p || !canAct(game, p)) return
    if (Math.hypot(hands.x, hands.z) > 1e-6 && p.seat === null) p.facing = Math.atan2(hands.x, hands.z)
    if (sits) sit(game, index)
    if (pushes) push(game, index)
  }

  const advance = (game: Game, dt: number, press: Press, paused: boolean) => {
    const net = getNet()
    const now = performance.now()

    if (net.host) {
      if (game.players.length === 0) return false
      const shared = net.status === 'joined' && net.peers > 0
      if (paused && !shared) return false
      const me = game.players.findIndex((p) => p.mine)
      if (me >= 0) act(game, me, paused ? { x: 0, z: 0 } : press.hands, !paused && press.sit, !paused && press.push)
      botPlay(game)
      for (const said of heard.current.splice(0)) {
        const index = game.players.findIndex((p) => p.id === said.from)
        if (index < 0 || said.game !== game.id) continue
        const before = counted.current.get(`${game.id}:${said.from}`) ?? { sits: 0, pushes: 0 }
        act(game, index, { x: said.x, z: said.z }, said.sits > before.sits, said.pushes > before.pushes)
        counted.current.set(`${game.id}:${said.from}`, { sits: Math.max(before.sits, said.sits), pushes: Math.max(before.pushes, said.pushes) })
      }
      if (net.status === 'joined') {
        const here = new Set(getPeers().map((p) => p.id))
        game.players.forEach((p, index) => {
          if (!p.bot && !p.mine && !p.left && !here.has(p.id)) leave(game, index)
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
    if (game.players.length === 0) return false
    if (heardFrom && !game.over) {
      const hostElapsed = heardFrom.snap.elapsed + (now - heardFrom.at) / 1000
      const ours = game.elapsed + Math.min(Math.max(dt, 0), 0.25)
      game.elapsed =
        before !== game.id || Math.abs(hostElapsed - ours) > SNAP_SECONDS ? hostElapsed : ours + (hostElapsed - ours) * Math.min(1, Math.min(Math.max(dt, 0), 0.25) * 4)
    }
    const hands = paused ? { x: 0, z: 0 } : press.hands
    const m = mine.current
    const pressed = !paused && (press.sit || press.push)
    if (!paused && press.sit) m.sits += 1
    if (!paused && press.push) m.pushes += 1
    const moved = Math.abs(hands.x - m.x) > 0.01 || Math.abs(hands.z - m.z) > 0.01
    if (!game.over && (pressed || moved || now - handsAt.current >= HANDS_MS)) {
      handsAt.current = now
      m.x = hands.x
      m.z = hands.z
      sendToRoom(encodeHands({ game: game.id, x: hands.x, z: hands.z, sits: m.sits, pushes: m.pushes }))
    }
    return true
  }

  return { advance }
}
