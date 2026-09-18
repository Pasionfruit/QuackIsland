/**
 * The two ends of a shared tower.
 *
 * The **host** runs the game: everybody's walking - its own, the stand-ins', the
 * guests' - the turns, and every cut, and sends the tower out twenty times a
 * second. A **guest** sends which way it is walking and any cut it makes, and
 * draws what comes back.
 *
 * **A guest walks its own body itself.** Walking a round trip behind your keys
 * makes lining up with a string miserable, so a guest moves its own cutter the
 * way the host does, the moment a key goes down, and only drifts back to the
 * host's word - gently while walking, quickly once still, at once if far out.
 * Everybody else eases towards where the host says.
 *
 * The same lessons as the other minigames: intents are repeated and forgotten
 * after a silence; a cut is said until it is taken and counts once; a guest keeps
 * listening after the game ends; somebody who leaves the lobby is out; a pause stops the round for everybody. Alone, the clock stops.
 */
import { useEffect, useRef } from 'react'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { botCut, botIntents } from './ai'
import { TOWER, cut, leave, stepGame, walk, whoseTurn, type Game, type Intent } from './rules'
import { myId } from './setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type GuestIntent, type Snapshot } from './wire'

const SEND_MS = 50
const REPEAT_MS = 250
/** Past this, a guest stops walking on the host. */
const INTENT_TIMEOUT_MS = 1000
const EASE_RATE = 14
/** How fast a guest's own body drifts to the host's word: walking, and standing still. */
const OWN_DRIFT = { walking: 0.6, still: 5 }
/** Past this far from the host's word, a body jumps to it. */
const SNAP_DISTANCE = 2.5
const SNAP_SECONDS = 0.5
const NO_WALK: Intent = { x: 0, y: 0 }

export interface TowerNet {
  /** Moves the game on a frame. `walking` is this browser's keys; `cutting` a string clicked this frame, if any. */
  advance(game: Game, dt: number, walking: Intent, cutting: number | null, paused: boolean): boolean
}

export function useTowerNet(): TowerNet {
  const heard = useRef(new Map<string, { intent: GuestIntent; at: number }>())
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const saidAt = useRef(0)
  const lastSaid = useRef('')
  const lastGame = useRef(0)
  const cutSeq = useRef(0)
  const pendingCut = useRef<{ seq: number; turn: number; string: number; firstAt: number } | null>(null)

  useEffect(() => {
    const stop = subscribeRoom((from, raw) => {
      if (getNet().host) {
        const said = decodeIntent(raw)
        if (said) heard.current.set(from, { intent: said, at: performance.now() })
        return
      }
      const snap = decodeSnapshot(raw)
      if (snap) latest.current = { snap, at: performance.now() }
    })
    return () => {
      stop()
      // Walking out of the game must not leave your body walking.
      if (!getNet().host && lastGame.current !== 0) sendToRoom(encodeIntent({ game: lastGame.current, walk: NO_WALK, cut: null }))
    }
  }, [])

  const advance = (game: Game, dt: number, walking: Intent, cutting: number | null, paused: boolean): boolean => {
    const net = getNet()
    const now = performance.now()
    const wish = paused ? NO_WALK : walking
    lastGame.current = game.id

    // A pause is shared: whoever pressed it stopped the round for everybody,
    // so this stops dead - the host's own simulation included. A round that
    // carried on behind the card would make the card a lie. See
    // `15-minigames/internal/pause.ts`.
    if (paused) return false

    if (net.host) {
      if (game.players.length === 0) return false

      const me = game.players.findIndex((p) => p.mine)
      const intents = botIntents(game)
      if (me >= 0) intents.set(game.players[me].id, wish)
      if (cutting !== null && !paused && me >= 0) cut(game, me, cutting)
      const move = botCut(game)
      if (move) cut(game, move.player, move.string)

      for (const [id, entry] of heard.current) {
        const player = game.players.findIndex((p) => p.id === id)
        if (player < 0 || entry.intent.game !== game.id) continue
        const quiet = now - entry.at > INTENT_TIMEOUT_MS
        intents.set(id, quiet ? NO_WALK : entry.intent.walk)
        const asked = entry.intent.cut
        const cutter = game.players[player]
        if (asked && asked.seq > cutter.seq) {
          cutter.seq = asked.seq
          cut(game, player, asked.string, { turn: asked.turn, grace: TOWER.reachGrace })
        }
      }
      if (net.status === 'joined') {
        // Somebody who has left the lobby is not coming back to the tower.
        const here = new Set(getPeers().map((p) => p.id))
        game.players.forEach((cutter, index) => {
          if (!cutter.bot && !cutter.mine && !cutter.out && !here.has(cutter.id)) leave(game, index)
        })
      }
      stepGame(game, intents, dt)

      if (net.status === 'joined' && now - sentAt.current >= SEND_MS) {
        sentAt.current = now
        sendToRoom(encodeSnapshot(game))
      }
      return true
    }

    // A guest. The host's word first.
    const heardFrom = latest.current
    const step = Math.min(Math.max(dt, 0), 0.1)
    const me = game.players.findIndex((p) => p.mine)
    const mine = game.players[me]
    const ownBefore = mine ? { x: mine.x, y: mine.y, facing: mine.facing } : null
    const was = new Map(game.players.map((p) => [p.id, { x: p.x, y: p.y }]))
    const before = { id: game.id, phase: game.phase, turns: game.turns, clock: game.clock, elapsed: game.elapsed }
    let hostAt: Map<string, { x: number; y: number; facing: number }> | null = null
    if (heardFrom && heardFrom.snap !== applied.current) {
      applied.current = heardFrom.snap
      hostAt = applySnapshot(game, heardFrom.snap, myId())
    }
    if (game.players.length === 0) return false

    // The clocks run on between snapshots.
    if (heardFrom) {
      const age = (now - heardFrom.at) / 1000
      const samePhase = before.id === game.id && before.phase === game.phase && before.turns === game.turns
      const hostClock = heardFrom.snap.clock + age
      const ours = before.clock + step
      game.clock = !samePhase || Math.abs(hostClock - ours) > SNAP_SECONDS ? hostClock : ours + (hostClock - ours) * Math.min(1, step * 6)
      const hostElapsed = heardFrom.snap.elapsed + age
      const oursElapsed = before.elapsed + step
      game.elapsed = before.id !== game.id || Math.abs(hostElapsed - oursElapsed) > SNAP_SECONDS ? hostElapsed : oursElapsed + (hostElapsed - oursElapsed) * Math.min(1, step * 6)
    }

    // Bodies: everybody else eases to the host's word; our own walks itself.
    const rate = 1 - Math.exp(-EASE_RATE * step)
    for (const cutter of game.players) {
      const target = hostAt?.get(cutter.id) ?? null
      const from = was.get(cutter.id)
      if (cutter.mine && ownBefore) {
        Object.assign(cutter, ownBefore)
        if (!cutter.out && game.phase !== 'over') walk(cutter, wish, step)
        continue
      }
      if (!target) continue
      if (!from || Math.hypot(target.x - from.x, target.y - from.y) > SNAP_DISTANCE) {
        Object.assign(cutter, target)
      } else {
        cutter.x = from.x + (target.x - from.x) * rate
        cutter.y = from.y + (target.y - from.y) * rate
        cutter.facing = target.facing
      }
    }
    if (mine && hostAt) {
      const target = hostAt.get(mine.id)
      if (target) {
        const off = Math.hypot(target.x - mine.x, target.y - mine.y)
        if (off > SNAP_DISTANCE || mine.out) {
          mine.x = target.x
          mine.y = target.y
        } else {
          const moving = Math.hypot(wish.x, wish.y) > 0
          const drift = 1 - Math.exp(-(moving ? OWN_DRIFT.walking : OWN_DRIFT.still) * Math.max(step, 0.05))
          mine.x += (target.x - mine.x) * drift
          mine.y += (target.y - mine.y) * drift
        }
      }
    }

    // A cut: said once now, and again with every intent until the host has taken it.
    const waiting = pendingCut.current
    if (waiting && ((mine && mine.seq >= waiting.seq) || now - waiting.firstAt > 2000 || game.turns !== waiting.turn)) {
      pendingCut.current = null
    }
    let changed = false
    if (cutting !== null && !paused && mine && !pendingCut.current && whoseTurn(game) === me) {
      cutSeq.current = Math.max(cutSeq.current, mine.seq) + 1
      pendingCut.current = { seq: cutSeq.current, turn: game.turns, string: cutting, firstAt: now }
      changed = true
    }

    const said = pendingCut.current
    const intent: GuestIntent = { game: game.id, walk: wish, cut: said ? { seq: said.seq, turn: said.turn, string: said.string } : null }
    const text = `${game.id}:${wish.x.toFixed(2)}:${wish.y.toFixed(2)}:${said?.seq ?? 0}`
    if (game.id !== 0 && (changed || text !== lastSaid.current || now - saidAt.current >= REPEAT_MS)) {
      lastSaid.current = text
      saidAt.current = now
      sendToRoom(encodeIntent(intent))
    }
    return true
  }

  return { advance }
}
