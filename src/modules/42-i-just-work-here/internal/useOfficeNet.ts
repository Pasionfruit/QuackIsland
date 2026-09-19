/**
 * The two ends of a shared office.
 *
 * The **host** runs the game - the clock, its own player, the stand-ins, the
 * guests' as they report, every piece, every rocket, every blast and the end -
 * and sends it fifteen times a second. A **guest** walks and aims on its own
 * screen, and picks up, places, drops and fires there too, so none of it waits
 * on a round trip. It reports where it is, and each thing it does as it does it.
 *
 * The host takes a guest's walk only as far as it could have walked since it
 * last heard, and what it does only if it could be true - see `claimAct` and
 * `claimFire`. Rockets fly and burst on the host alone; nobody is eliminated
 * until the host says so.
 *
 * The same lessons as the other minigames: a guest keeps listening after the
 * game ends; somebody who leaves the lobby is out; a pause stops the round for
 * everybody. Alone, the clock stops.
 */
import { useEffect, useRef } from 'react'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { botSteer } from './ai'
import {
  ROUND,
  act,
  aim,
  claimAct,
  claimFire,
  clock,
  coastRockets,
  drop,
  fire,
  flyRockets,
  judgeEnd,
  leave,
  report,
  tick,
  walk,
  type Blast,
  type Game,
  type Rocket,
} from './rules'
import { myId } from './setup'
import { applySnapshot, decodeAct, decodeMove, decodeSnapshot, encodeAct, encodeMove, encodeSnapshot, type Act, type Snapshot } from './wire'

const SEND_MS = 66
const REPORT_MS = 50
/** How long a guest trusts its own pieces over the host's after it does something with one, ms. */
const HOLD_MS = 800
/** Past this far apart, a guest's clock jumps to the host's rather than easing. */
const SNAP_SECONDS = 0.4

/** What your hands are doing this frame. */
export interface Hands {
  /** -1 to 1 each: A to D, W to S. */
  x: number
  z: number
  yaw: number
  /** Left click since the last frame: pick up, or place. */
  act: boolean
  /** Right click since the last frame: fire. */
  fire: boolean
  /** Space since the last frame: put down. */
  drop: boolean
}

export interface Done {
  changed: boolean
  /** What you did with your hands this frame, for the sounds and the words. */
  did: 'pick' | 'place' | 'drop' | 'fire' | 'nothing' | null
  rocket: Rocket | Blast | null
}

export interface OfficeNet {
  advance(game: Game, dt: number, hands: Hands | null, paused: boolean): Done
}

type Heard = { from: string } & ({ kind: 'move'; game: number; x: number; z: number; yaw: number } | { kind: 'act'; game: number; act: Act })

export function useOfficeNet(): OfficeNet {
  const heard = useRef<Heard[]>([])
  const heardAt = useRef(new Map<string, number>())
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const reportedAt = useRef(0)
  const heldUntil = useRef(0)

  useEffect(() => {
    return subscribeRoom((from, raw) => {
      if (getNet().host) {
        const move = decodeMove(raw)
        if (move) {
          heard.current.push({ from, ...move, kind: 'move' })
          return
        }
        const a = decodeAct(raw)
        if (a) heard.current.push({ from, kind: 'act', game: a.game, act: a })
        return
      }
      const snap = decodeSnapshot(raw)
      if (snap) latest.current = { snap, at: performance.now() }
    })
  }, [])

  /** Your hands, on your own player: the same on the host and on a guest, but for who is told. */
  const handle = (game: Game, me: number, hands: Hands, dt: number, host: boolean): Omit<Done, 'changed'> => {
    aim(game, me, hands.yaw)
    walk(game, me, hands, dt)
    const p = game.players[me]
    const tell = (kind: Act['kind'], piece: number) => {
      if (!host) sendToRoom(encodeAct({ game: game.id, kind, piece, x: p.x, z: p.z, yaw: p.yaw }))
    }
    if (hands.fire) {
      const rocket = fire(game, me, host)
      if (rocket) {
        tell('fire', -1)
        return { did: 'fire', rocket }
      }
    }
    if (hands.act) {
      const carrying = p.carrying
      const did = act(game, me)
      if (did) {
        heldUntil.current = performance.now() + HOLD_MS
        tell(did, did === 'pick' ? p.carrying : carrying)
        return { did, rocket: null }
      }
      return { did: 'nothing', rocket: null }
    }
    if (hands.drop && drop(game, me)) {
      heldUntil.current = performance.now() + HOLD_MS
      tell('drop', -1)
      return { did: 'drop', rocket: null }
    }
    return { did: null, rocket: null }
  }

  const advance = (game: Game, dt: number, hands: Hands | null, paused: boolean): Done => {
    const net = getNet()
    const now = performance.now()
    // A pause is shared: whoever pressed it stopped the round for everybody.
    // See `15-minigames/internal/pause.ts`.
    if (paused) return { changed: false, did: null, rocket: null }

    if (net.host) {
      if (game.players.length === 0) return { changed: false, did: null, rocket: null }
      tick(game, dt)
      let done: Omit<Done, 'changed'> = { did: null, rocket: null }
      const me = game.players.findIndex((p) => p.mine)
      if (me >= 0 && hands && !game.over && clock(game) >= 0) done = handle(game, me, hands, dt, true)
      botSteer(game, dt)
      // In the order they arrived, so a guest's last step comes before what it did there.
      for (const said of heard.current.splice(0)) {
        const player = game.players.findIndex((p) => p.id === said.from)
        if (player < 0 || said.game !== game.id) continue
        if (said.kind === 'act') {
          if (said.act.kind === 'fire') claimFire(game, player, said.act)
          else claimAct(game, player, said.act.kind, said.act.piece, said.act)
          continue
        }
        const key = `${game.id}:${said.from}`
        const last = heardAt.current.get(key) ?? ROUND.countdown
        report(game, player, said, said.yaw, game.elapsed - last)
        if (clock(game) >= 0) heardAt.current.set(key, game.elapsed)
      }
      if (!game.over) flyRockets(game, dt)
      if (net.status === 'joined') {
        const here = new Set(getPeers().map((p) => p.id))
        game.players.forEach((p, index) => {
          if (!p.bot && !p.mine && !p.left && !here.has(p.id)) leave(game, index)
        })
      }
      judgeEnd(game)
      if (net.status === 'joined' && now - sentAt.current >= SEND_MS) {
        sentAt.current = now
        sendToRoom(encodeSnapshot(game))
      }
      return { changed: true, ...done }
    }

    // A guest. The host's word first, then the clock, then our own hands.
    const heardFrom = latest.current
    const before = game.id
    if (heardFrom && heardFrom.snap !== applied.current) {
      applied.current = heardFrom.snap
      applySnapshot(game, heardFrom.snap, myId(), now < heldUntil.current)
    }
    if (game.players.length === 0) return { changed: false, did: null, rocket: null }

    tick(game, dt)
    coastRockets(game, dt)
    if (heardFrom && !game.over) {
      const hostElapsed = heardFrom.snap.elapsed + (now - heardFrom.at) / 1000
      const ours = game.elapsed
      game.elapsed =
        before !== game.id || Math.abs(hostElapsed - ours) > SNAP_SECONDS ? hostElapsed : ours + (hostElapsed - ours) * Math.min(1, Math.min(Math.max(dt, 0), 0.25) * 4)
    }

    let done: Omit<Done, 'changed'> = { did: null, rocket: null }
    const me = game.players.findIndex((p) => p.mine)
    const mine = game.players[me]
    if (mine && hands && !game.over && clock(game) >= 0) done = handle(game, me, hands, dt, false)
    if (mine && !game.over && clock(game) >= 0 && mine.out === null && now - reportedAt.current >= REPORT_MS) {
      reportedAt.current = now
      sendToRoom(encodeMove(game.id, mine))
    }
    return { changed: true, ...done }
  }

  return { advance }
}
