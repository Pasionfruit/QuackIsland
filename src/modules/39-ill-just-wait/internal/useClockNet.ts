/**
 * The two ends of a shared game.
 *
 * The **host** runs the clock, moves the stand-ins' hands, takes everybody's
 * readings and answers (its own, the stand-ins', the guests' as they arrive)
 * and sends the lot. A **guest** runs its own clock between snapshots, eased
 * towards the host's, sends where its hands are ten times a second, and checks
 * its own answers - it knows the targets, so a wrong one resets its clock at
 * once without waiting on anybody. A right one moves it on to the next target
 * straight away and goes to the host, said again until the host shows it.
 *
 * The same lessons as the other minigames: an answer counts once; a guest
 * keeps listening after the game ends; somebody who leaves the lobby is not
 * waited for; a pause stops the game for everybody.
 */
import { useEffect, useRef } from 'react'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { botMoves } from './ai'
import { CLOCK, answerFor, confirm, leave, setHand, stageOf, stepGame, type Game, type Verdict } from './rules'
import { myId } from './setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Answer, type Intent, type Snapshot } from './wire'
import { TARGETS, wrap } from './wording'

const SEND_MS = 100
/** Past this far apart, a guest's clock jumps to the host's rather than easing. */
const SNAP_SECONDS = 0.4

export interface ClockNet {
  /**
   * Moves the game on a frame. `hand` is where this browser's clock reads;
   * `answer` is what it read when Space went down since the last frame, or
   * null. Says whether anything moved, and what the answer was judged.
   */
  advance(game: Game, dt: number, hand: number, answer: number | null, paused: boolean): { moved: boolean; verdict: Verdict | null }
}

export function useClockNet(): ClockNet {
  const heard = useRef<{ from: string; intent: Intent }[]>([])
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const pending = useRef<{ game: number; answers: Answer[] }>({ game: -1, answers: [] })

  useEffect(() => {
    return subscribeRoom((from, raw) => {
      if (getNet().host) {
        const intent = decodeIntent(raw)
        if (intent) heard.current.push({ from, intent })
        return
      }
      const snap = decodeSnapshot(raw)
      if (snap) latest.current = { snap, at: performance.now() }
    })
  }, [])

  const advance = (game: Game, dt: number, hand: number, answer: number | null, paused: boolean) => {
    const net = getNet()
    const now = performance.now()
    const idle = { moved: false, verdict: null }

    // A pause is shared and stops the game dead - the host's included.
    if (paused) return idle

    if (net.host) {
      if (game.players.length === 0) return idle
      const me = game.players.findIndex((p) => p.mine)
      let verdict: Verdict | null = null
      if (me >= 0) {
        setHand(game, me, hand)
        if (answer !== null) verdict = confirm(game, me, stageOf(game.players[me]), answer)
      }
      for (const move of botMoves(game)) {
        if (move.answer) confirm(game, move.player, move.answer.stage, answerFor(game, move.answer.stage), move.answer.at)
        else setHand(game, move.player, move.minutes)
      }
      for (const { from, intent } of heard.current.splice(0)) {
        const player = game.players.findIndex((p) => p.id === from)
        if (player < 0 || intent.game !== game.id) continue
        // Answers first: a right one puts the clock back to twelve, and the
        // reading that came with it is the guest's clock after that.
        for (const a of intent.answers) confirm(game, player, a.stage, a.minutes)
        setHand(game, player, intent.minutes)
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
      return { moved: true, verdict }
    }

    // A guest. The host's word first, then the clock, then our own hands.
    const said = pending.current
    const heardFrom = latest.current
    if (heardFrom && heardFrom.snap !== applied.current) {
      applied.current = heardFrom.snap
      const localClock = game.clock
      const sameGame = game.id === heardFrom.snap.id
      if (said.game !== heardFrom.snap.id) pending.current = { game: heardFrom.snap.id, answers: [] }
      applySnapshot(game, heardFrom.snap, myId(), pending.current.answers.map((a) => a.stage))
      if (sameGame && !game.over) game.clock = localClock
      // Answers the host now shows got have been heard.
      const shown = heardFrom.snap.players.find(([id]) => id === myId())
      if (shown) pending.current.answers = pending.current.answers.filter((a) => (shown[2][a.stage] ?? -1) < 0)
    }
    if (game.players.length === 0) return idle

    const step = Math.min(Math.max(dt, 0), 0.25)
    if (!game.over && heardFrom && heardFrom.snap.id === game.id) {
      const ours = game.clock + step
      const hostNow = heardFrom.snap.clock + (now - heardFrom.at) / 1000
      const gap = hostNow - ours
      game.clock = Math.abs(gap) > SNAP_SECONDS ? hostNow : ours + gap * Math.min(1, step * 8)
      game.clock = Math.max(0, Math.min(CLOCK.limit, game.clock))
    }

    const mine = game.players.find((p) => p.mine)
    let verdict: Verdict | null = null
    let urgent = false
    if (mine && !game.over && !mine.left) {
      mine.minutes = wrap(hand)
      const stage = stageOf(mine)
      if (answer !== null && stage < TARGETS) {
        mine.minutes = 0
        if (wrap(answer) === answerFor(game, stage)) {
          verdict = 'right'
          mine.solved[stage] = Math.round(game.clock * 100) / 100
          pending.current.answers.push({ stage, minutes: wrap(answer) })
          urgent = true
        } else {
          verdict = 'wrong'
        }
      }
      if (urgent || now - sentAt.current >= SEND_MS) {
        sentAt.current = now
        sendToRoom(encodeIntent({ game: game.id, minutes: verdict ? 0 : wrap(hand), answers: pending.current.answers }))
      }
    }
    return { moved: true, verdict }
  }

  return { advance }
}
