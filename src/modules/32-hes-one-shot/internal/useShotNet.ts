/**
 * The two ends of a shared arena.
 *
 * The **host** runs the game - the clock, its own player, the stand-ins', the
 * guests' as they report, every hit and the end - and sends it fifteen times a
 * second. A **guest** walks and aims on its own screen, and judges its own shots
 * against what its screen shows: whether you had somebody in your crosshair is a
 * matter of pixels and milliseconds and cannot wait for a round trip. It reports
 * where it is, and each shot as it fires.
 *
 * The host takes a guest's position only as far as it could have walked since it
 * last heard, and a guest's hit only if it could be true - see `claim`. Nobody is
 * eliminated until the host says so.
 *
 * The same lessons as the other minigames: a guest keeps listening after the
 * game ends; somebody who leaves the lobby is out; a pause stops the round for everybody. Alone, the clock stops.
 */
import { useEffect, useRef } from 'react'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { botSteer } from './ai'
import { ROUND, claim, clock, fire, judgeEnd, leave, look, report, tick, walk, type Claim, type Game, type Shot } from './rules'
import { myId } from './setup'
import { applySnapshot, decodeMove, decodeShot, decodeSnapshot, encodeMove, encodeShot, encodeSnapshot, type Snapshot } from './wire'

const SEND_MS = 66
const REPORT_MS = 50
/** Past this far apart, a guest's clock jumps to the host's rather than easing. */
const SNAP_SECONDS = 0.4

/** What your hands are doing this frame. */
export interface Hands {
  /** -1 to 1 each: S to W, A to D. */
  forward: number
  right: number
  yaw: number
  pitch: number
  /** The trigger was pulled since the last frame. */
  fire: boolean
}

export interface ShotNet {
  /** Moves the game on a frame. The shot you fired, if one went off. */
  advance(game: Game, dt: number, hands: Hands | null, paused: boolean): { changed: boolean; shot: Shot | null }
}

type Heard = { from: string; game: number } & ({ kind: 'move'; x: number; z: number; yaw: number; pitch: number } | ({ kind: 'shot' } & Claim))

export function useShotNet(): ShotNet {
  const heard = useRef<Heard[]>([])
  const heardAt = useRef(new Map<string, number>())
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const reportedAt = useRef(0)

  useEffect(() => {
    return subscribeRoom((from, raw) => {
      if (getNet().host) {
        const move = decodeMove(raw)
        if (move) {
          heard.current.push({ from, kind: 'move', ...move })
          return
        }
        const shot = decodeShot(raw)
        if (shot) heard.current.push({ from, kind: 'shot', ...shot })
        return
      }
      const snap = decodeSnapshot(raw)
      if (snap) latest.current = { snap, at: performance.now() }
    })
  }, [])

  const advance = (game: Game, dt: number, hands: Hands | null, paused: boolean) => {
    const net = getNet()
    const now = performance.now()
    let shot: Shot | null = null

    // A pause is shared: whoever pressed it stopped the round for everybody,
    // so this stops dead - the host's own simulation included. A round that
    // carried on behind the card would make the card a lie. See
    // `15-minigames/internal/pause.ts`.
    if (paused) return { changed: false, shot }

    if (net.host) {
      if (game.players.length === 0) return { changed: false, shot }
      tick(game, dt)
      const me = game.players.findIndex((p) => p.mine)
      if (me >= 0 && hands && !paused) {
        look(game, me, hands.yaw, hands.pitch)
        walk(game, me, hands, dt)
        if (hands.fire) shot = fire(game, me, true)
      }
      botSteer(game, dt)
      // In the order they arrived, so a guest's last step comes before the shot it took from there.
      for (const said of heard.current.splice(0)) {
        const player = game.players.findIndex((p) => p.id === said.from)
        if (player < 0 || said.game !== game.id) continue
        if (said.kind === 'shot') {
          claim(game, player, said)
          continue
        }
        const key = `${game.id}:${said.from}`
        const last = heardAt.current.get(key) ?? ROUND.countdown
        report(game, player, said, said.yaw, said.pitch, game.elapsed - last)
        if (clock(game) >= 0) heardAt.current.set(key, game.elapsed)
      }
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
      return { changed: true, shot }
    }

    // A guest. The host's word first, then the clock, then our own hands.
    const heardFrom = latest.current
    const before = game.id
    if (heardFrom && heardFrom.snap !== applied.current) {
      applied.current = heardFrom.snap
      applySnapshot(game, heardFrom.snap, myId())
    }
    if (game.players.length === 0) return { changed: false, shot }

    tick(game, dt)
    if (heardFrom && !game.over) {
      const hostElapsed = heardFrom.snap.elapsed + (now - heardFrom.at) / 1000
      const ours = game.elapsed
      game.elapsed =
        before !== game.id || Math.abs(hostElapsed - ours) > SNAP_SECONDS ? hostElapsed : ours + (hostElapsed - ours) * Math.min(1, Math.min(Math.max(dt, 0), 0.25) * 4)
    }

    const me = game.players.findIndex((p) => p.mine)
    const mine = game.players[me]
    if (mine && hands && !paused) {
      look(game, me, hands.yaw, hands.pitch)
      walk(game, me, hands, dt)
      if (hands.fire) {
        shot = fire(game, me, false)
        if (shot) {
          const victim = shot.hit >= 0 ? game.players[shot.hit].id : null
          sendToRoom(encodeShot(game.id, { x: mine.x, z: mine.z, yaw: mine.yaw, pitch: mine.pitch, victim }))
        }
      }
    }
    if (mine && !game.over && clock(game) >= 0 && now - reportedAt.current >= REPORT_MS) {
      reportedAt.current = now
      sendToRoom(encodeMove(game.id, mine))
    }
    return { changed: true, shot }
  }

  return { advance }
}
