/**
 * The two ends of a shared game.
 *
 * The **host** runs the game: it hears what everybody wants, applies it,
 * counts down, reveals, and sends the game out. A **guest** says what it wants
 * and follows what comes back. One game in the lobby, and only the host ever
 * holds the seed that decides which paths hold.
 *
 * Alone, you are your own host with nobody listening - one path, not two.
 *
 * The same arrangement as the other minigames, with one addition: **a guest
 * sees its own choice straight away.** Choosing is the whole game, and a path
 * that lights up a round trip after you press the key feels broken in a way a
 * body arriving 50 ms late does not. The host is still the one who decides -
 * the guest's copy is only ahead of it, never different from where it ends up.
 */
import { useEffect, useRef } from 'react'
import { getNet, sendToRoom, subscribeRoom } from '../../09-net'
import { botIntents } from './ai'
import { applyIntent, stepGame, type Game, type Intent } from './game'
import { myId } from './setup'
import {
  applySnapshot,
  decodeIntent,
  decodeSnapshot,
  encodeIntent,
  encodeSnapshot,
  type Snapshot,
} from './wire'

/** How often the host sends the game, in milliseconds. */
const SEND_MS = 100
/** How often a guest repeats what it wants, changed or not. */
const REPEAT_MS = 250

export interface GameNet {
  /**
   * Moves the game on a frame, and returns whether anything changed.
   *
   * `wish` is what this browser's player wants. It is brought up to date with
   * the round here - a new round starts from wherever the host put you, not
   * confirmed - so the screen can simply read and change it.
   */
  advance(game: Game, dt: number, wish: Intent, paused: boolean): boolean
}

export function useGameNet(): GameNet {
  const heard = useRef(new Map<string, Intent>())
  const latest = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const saidAt = useRef(0)
  const lastSaid = useRef('')

  useEffect(() => {
    return subscribeRoom((from, raw) => {
      if (getNet().host) {
        const intent = decodeIntent(raw)
        if (intent) heard.current.set(from, intent)
        return
      }
      const snap = decodeSnapshot(raw)
      if (snap) latest.current = snap
    })
  }, [])

  /** A new round, or a new game: start from where the host has you. */
  const catchUp = (game: Game, wish: Intent) => {
    if (wish.round === game.round) return
    const me = game.players.find((p) => p.mine)
    wish.round = game.round
    wish.pick = me?.pick ?? 1
    wish.confirmed = false
  }

  const advance = (game: Game, dt: number, wish: Intent, paused: boolean): boolean => {
    const net = getNet()
    const now = performance.now()

    if (net.host) {
      if (game.players.length === 0) return false
      catchUp(game, wish)
      const shared = net.status === 'joined' && net.peers > 0
      if (paused && !shared) return false

      if (game.phase === 'choosing') {
        for (const [id, intent] of botIntents(game)) applyIntent(game, id, intent)
        for (const [id, intent] of heard.current) applyIntent(game, id, intent)
        applyIntent(game, myId(), wish)
      }
      const round = game.round
      stepGame(game, dt)
      // A round that ended this frame: the wishes heard were for that one.
      if (game.round !== round) heard.current.clear()

      if (net.status === 'joined' && now - sentAt.current >= SEND_MS) {
        sentAt.current = now
        sendToRoom(encodeSnapshot(game))
      }
      return true
    }

    const snap = latest.current
    if (snap) applySnapshot(game, snap, myId())
    if (game.players.length === 0) return false
    catchUp(game, wish)

    const said = `${wish.round}:${wish.pick}:${wish.confirmed}`
    if (said !== lastSaid.current || now - saidAt.current >= REPEAT_MS) {
      lastSaid.current = said
      saidAt.current = now
      sendToRoom(encodeIntent(wish))
    }

    // Ahead of the host on your own choice, and on nothing else.
    const me = game.players.find((p) => p.mine)
    if (me && me.alive && game.phase === 'choosing') {
      me.pick = wish.pick
      me.confirmed = wish.confirmed
    }
    return true
  }

  return { advance }
}
