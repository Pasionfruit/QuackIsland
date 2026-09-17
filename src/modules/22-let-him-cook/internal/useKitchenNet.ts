/**
 * The two ends of a shared kitchen.
 *
 * The **host** runs the kitchen: the chef's clock, the turns, its own picks, the
 * stand-ins', and the guests' as they arrive, and sends what everybody can see.
 * A **guest** sends its pick when it is its turn, and draws what comes back,
 * with its clock running on between snapshots so the chef's hands and the turn
 * timer move smoothly.
 *
 * The same arrangement, and the same lessons, as the other minigames: a pick is
 * said again until the turn moves on; a guest keeps listening after the game
 * ends; the host never runs or sends a kitchen nobody was dealt into; somebody
 * who leaves the lobby is out; pausing in a lobby stops only your hands - the
 * turn timer does not wait for you. Alone, the clock stops.
 */
import { useEffect, useRef } from 'react'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { botMove } from './ai'
import { KITCHEN, cookTime, leave, pick, stepGame, turnTime, whoseTurn, type Game } from './rules'
import { myId } from './setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Snapshot } from './wire'

const SEND_MS = 100
const RESEND_MS = 150
const GIVE_UP_MS = 2500
/** Past this far apart, a guest's clock jumps to the host's rather than easing. */
const SNAP_SECONDS = 0.5

export interface KitchenNet {
  /** Moves the kitchen on a frame. `choice` is a slot clicked this frame, if any. */
  advance(game: Game, dt: number, choice: number | null, paused: boolean): boolean
  /** The slot this browser has picked and the host has not answered yet, or null. */
  pending(): number | null
}

/** How long the phase a guest is in lasts, to keep its clock from running past it. */
function phaseLength(game: Game): number {
  switch (game.phase) {
    case 'cooking':
      return cookTime(Math.max(game.picks.length, KITCHEN.recipe[1]), game.recipe)
    case 'order':
      return KITCHEN.order
    case 'turns':
      return turnTime(game.recipe)
    case 'result':
      return KITCHEN.result
    default:
      return Infinity
  }
}

export function useKitchenNet(): KitchenNet {
  const heard = useRef<{ from: string; game: number; turn: number; slot: number }[]>([])
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const waiting = useRef<{ game: number; turn: number; slot: number; firstAt: number; saidAt: number } | null>(null)

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

  const advance = (game: Game, dt: number, choice: number | null, paused: boolean): boolean => {
    const net = getNet()
    const now = performance.now()

    if (net.host) {
      if (game.players.length === 0) return false
      const shared = net.status === 'joined' && net.peers > 0
      if (paused && !shared) return false

      const me = game.players.findIndex((p) => p.mine)
      if (choice !== null && !paused && me >= 0) pick(game, me, choice)
      const move = botMove(game)
      if (move) pick(game, move.player, move.slot)
      for (const said of heard.current.splice(0)) {
        const player = game.players.findIndex((p) => p.id === said.from)
        if (player < 0 || said.game !== game.id || said.turn !== game.turn) continue
        pick(game, player, said.slot)
      }
      if (net.status === 'joined') {
        // Somebody who has left the lobby is not coming back to this kitchen.
        const here = new Set(getPeers().map((p) => p.id))
        game.players.forEach((cook, index) => {
          if (!cook.bot && !cook.mine && !cook.out && !here.has(cook.id)) leave(game, index)
        })
      }
      stepGame(game, dt)

      if (net.status === 'joined' && now - sentAt.current >= SEND_MS) {
        sentAt.current = now
        sendToRoom(encodeSnapshot(game))
      }
      return true
    }

    // A guest. The host's word first, then the clock, then our own pick.
    const heardFrom = latest.current
    const before = { id: game.id, phase: game.phase, turn: game.turn, recipe: game.recipe, clock: game.clock }
    if (heardFrom && heardFrom.snap !== applied.current) {
      applied.current = heardFrom.snap
      applySnapshot(game, heardFrom.snap, myId())
    }
    if (game.players.length === 0) return false

    const step = Math.min(Math.max(dt, 0), 0.25)
    if (heardFrom) {
      const hostNow = heardFrom.snap.clock + (now - heardFrom.at) / 1000
      const samePhase =
        before.id === game.id && before.phase === game.phase && before.turn === game.turn && before.recipe === game.recipe
      if (!samePhase) {
        game.clock = hostNow
      } else {
        const ours = before.clock + step
        const gap = hostNow - ours
        game.clock = Math.abs(gap) > SNAP_SECONDS ? hostNow : ours + gap * Math.min(1, step * 6)
      }
      game.clock = Math.max(0, Math.min(phaseLength(game), game.clock))
    }

    const me = game.players.findIndex((p) => p.mine)
    const pending = waiting.current
    if (pending && (pending.game !== game.id || game.turn > pending.turn || now - pending.firstAt > GIVE_UP_MS)) {
      waiting.current = null
    }
    if (choice !== null && !paused && !waiting.current && me >= 0 && whoseTurn(game) === me && game.claimed[choice] === null) {
      waiting.current = { game: game.id, turn: game.turn, slot: choice, firstAt: now, saidAt: now }
      sendToRoom(encodeIntent(game.id, game.turn, choice))
    }
    const said = waiting.current
    if (said && now - said.saidAt >= RESEND_MS) {
      said.saidAt = now
      sendToRoom(encodeIntent(said.game, said.turn, said.slot))
    }
    return true
  }

  return { advance, pending: () => waiting.current?.slot ?? null }
}
