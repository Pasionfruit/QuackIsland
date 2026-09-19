/**
 * The two ends of a shared gear.
 *
 * The **host** runs the game - the clock, the votes, the count, who goes, the
 * seats and the end - and sends it ten times a second. A **guest** votes and
 * walks on its own screen and sends each vote the moment it changes, and where
 * it stands ten times a second. The host takes a guest's vote until a moment
 * after the five seconds are up, for the wire.
 *
 * The same lessons as the other minigames: a guest keeps listening after the
 * game ends; somebody who leaves the lobby is out; a pause stops the round for
 * everybody.
 */
import { useEffect, useRef } from 'react'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { botSteer } from './ai'
import { ROUND, advance, canWalk, judgeEnd, leave, place, tick, vote, walk, type Game } from './rules'
import { myId } from './setup'
import { applySnapshot, decodeMove, decodeSnapshot, decodeVote, encodeMove, encodeSnapshot, encodeVote, type Snapshot } from './wire'

const SEND_MS = 100
const MOVE_MS = 100
const SNAP_SECONDS = 0.4

export interface Hands {
  mx: number
  mz: number
  /** A vote pressed since the last frame, or null. */
  vote: 0 | 1 | null
}

export interface GearNet {
  /** Moves the game on a frame. Whether your vote took. */
  advance(game: Game, dt: number, hands: Hands | null, paused: boolean): { changed: boolean; voted: boolean }
}

type Heard = { from: string; game: number } & ({ kind: 'vote'; round: number; vote: 0 | 1 } | { kind: 'move'; x: number; z: number })

export function useGearNet(): GearNet {
  const heard = useRef<Heard[]>([])
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const movedAt = useRef(0)

  useEffect(() => {
    return subscribeRoom((from, raw) => {
      if (getNet().host) {
        const v = decodeVote(raw)
        if (v) {
          heard.current.push({ from, kind: 'vote', ...v })
          return
        }
        const m = decodeMove(raw)
        if (m) heard.current.push({ from, kind: 'move', ...m })
        return
      }
      const snap = decodeSnapshot(raw)
      if (snap) latest.current = { snap, at: performance.now() }
    })
  }, [])

  const advanceGame = (game: Game, dt: number, hands: Hands | null, paused: boolean) => {
    const net = getNet()
    const now = performance.now()
    if (paused) return { changed: false, voted: false }

    if (net.host) {
      if (game.players.length === 0) return { changed: false, voted: false }
      tick(game, dt)
      let voted = false
      const me = game.players.findIndex((p) => p.mine)
      if (me >= 0 && hands) {
        walk(game, me, hands.mx, hands.mz, dt)
        if (hands.vote !== null) voted = vote(game, me, hands.vote)
      }
      botSteer(game, dt)
      for (const said of heard.current.splice(0)) {
        const player = game.players.findIndex((p) => p.id === said.from)
        if (player < 0 || said.game !== game.id) continue
        if (said.kind === 'vote') {
          if (said.round === game.round) vote(game, player, said.vote, ROUND.grace)
        } else place(game, player, said)
      }
      if (net.status === 'joined') {
        const here = new Set(getPeers().map((p) => p.id))
        game.players.forEach((p, index) => {
          if (!p.bot && !p.mine && !p.left && !here.has(p.id)) leave(game, index)
        })
      }
      advance(game)
      judgeEnd(game)
      if (net.status === 'joined' && now - sentAt.current >= SEND_MS) {
        sentAt.current = now
        sendToRoom(encodeSnapshot(game))
      }
      return { changed: true, voted }
    }

    // A guest. The host's word first, then the clock, then our own hands.
    const heardFrom = latest.current
    const before = game.id
    if (heardFrom && heardFrom.snap !== applied.current) {
      applied.current = heardFrom.snap
      applySnapshot(game, heardFrom.snap, myId())
    }
    if (game.players.length === 0) return { changed: false, voted: false }
    tick(game, dt)
    if (heardFrom && !game.over) {
      const hostElapsed = heardFrom.snap.elapsed + (now - heardFrom.at) / 1000
      const ours = game.elapsed
      game.elapsed =
        before !== game.id || Math.abs(hostElapsed - ours) > SNAP_SECONDS ? hostElapsed : ours + (hostElapsed - ours) * Math.min(1, Math.min(Math.max(dt, 0), 0.25) * 4)
    }
    let voted = false
    const me = game.players.findIndex((p) => p.mine)
    if (me >= 0 && hands) {
      walk(game, me, hands.mx, hands.mz, dt)
      if (hands.vote !== null && vote(game, me, hands.vote)) {
        voted = true
        sendToRoom(encodeVote(game.id, game.round, hands.vote))
      }
      if (canWalk(game, me) && now - movedAt.current >= MOVE_MS) {
        movedAt.current = now
        sendToRoom(encodeMove(game.id, game.players[me]))
      }
    }
    return { changed: true, voted }
  }

  return { advance: advanceGame }
}
