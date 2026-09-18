/**
 * The two ends of a shared contest.
 *
 * The **host** runs the game - the clock, the letters, its own attempts, the
 * stand-ins', the guests' as they arrive, and who gets each point - and sends
 * it ten times a second. A **guest** times its own reaction on its own screen and
 * sends its one attempt at each letter the moment it is made; how quickly you
 * typed cannot wait for a round trip, and should not depend on one.
 *
 * The same lessons as the other minigames: a guest keeps listening after the
 * game ends; somebody who leaves the lobby is out; a pause stops the round for everybody. Alone, the clock stops.
 */
import { useEffect, useRef } from 'react'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { botType } from './ai'
import { attempt, leave, stepGame, tick, type Game } from './rules'
import { myId } from './setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Snapshot } from './wire'

const SEND_MS = 100
/** Past this far apart, a guest's clock jumps to the host's rather than easing. */
const SNAP_SECONDS = 0.4

/** A key you typed, and how long after the letter appeared on your screen. */
export interface Typed {
  key: string
  reaction: number
}

export interface LetterNet {
  /** Moves the game on a frame, with what you typed since the last, if anything. What became of it. */
  advance(game: Game, dt: number, typed: Typed | null, paused: boolean): { changed: boolean; answer: 'right' | 'wrong' | null }
}

export function useLetterNet(): LetterNet {
  const heard = useRef<{ from: string; game: number; index: number; key: string; reaction: number }[]>([])
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)

  useEffect(() => {
    return subscribeRoom((from, raw) => {
      if (getNet().host) {
        const said = decodeIntent(raw)
        if (said) heard.current.push({ from, ...said })
        return
      }
      const snap = decodeSnapshot(raw)
      if (snap) latest.current = { snap, at: performance.now() }
    })
  }, [])

  const advance = (game: Game, dt: number, typed: Typed | null, paused: boolean) => {
    const net = getNet()
    const now = performance.now()
    let answer: 'right' | 'wrong' | null = null

    // A pause is shared: whoever pressed it stopped the round for everybody,
    // so this stops dead - the host's own simulation included. A round that
    // carried on behind the card would make the card a lie. See
    // `15-minigames/internal/pause.ts`.
    if (paused) return { changed: false, answer }

    if (net.host) {
      if (game.players.length === 0) return { changed: false, answer }
      const me = game.players.findIndex((p) => p.mine)
      if (me >= 0 && typed && !paused) answer = attempt(game, me, typed.key, typed.reaction)
      botType(game)
      for (const said of heard.current.splice(0)) {
        const player = game.players.findIndex((p) => p.id === said.from)
        if (player < 0 || said.game !== game.id || said.index !== game.letter.index) continue
        attempt(game, player, said.key, said.reaction)
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
      return { changed: true, answer }
    }

    // A guest. The host's word first, then the clock, then our own attempt.
    const heardFrom = latest.current
    const before = game.id
    if (heardFrom && heardFrom.snap !== applied.current) {
      applied.current = heardFrom.snap
      applySnapshot(game, heardFrom.snap, myId())
    }
    if (game.players.length === 0) return { changed: false, answer }

    tick(game, dt)
    if (heardFrom && !game.over) {
      const hostElapsed = heardFrom.snap.elapsed + (now - heardFrom.at) / 1000
      const ours = game.elapsed
      game.elapsed =
        before !== game.id || Math.abs(hostElapsed - ours) > SNAP_SECONDS ? hostElapsed : ours + (hostElapsed - ours) * Math.min(1, Math.min(Math.max(dt, 0), 0.25) * 4)
    }

    const me = game.players.findIndex((p) => p.mine)
    if (me >= 0 && typed && !paused) {
      answer = attempt(game, me, typed.key, typed.reaction)
      if (answer) sendToRoom(encodeIntent(game.id, game.letter.index, typed.key.toUpperCase(), typed.reaction))
    }
    return { changed: true, answer }
  }

  return { advance }
}
