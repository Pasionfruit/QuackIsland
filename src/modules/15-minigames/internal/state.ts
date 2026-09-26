/**
 * What the minigame screen is showing: nothing, the dashboard, or one game.
 *
 * **Browsing is local; being in a game is the host's call.** The host flicking
 * through forty-one tiles has no business dragging anybody's screen about, so
 * the dashboard is yours alone. The moment they *open* a game, everybody goes
 * with them and reads the same briefing; when they press play, everybody
 * plays. See `call.ts` for the rule and `hostChoice` in `13-modes` for the
 * machinery underneath it.
 *
 * A guest has no dashboard and no play button. There is nothing for them to
 * press, because there is nothing they could press that would not immediately
 * be overruled - which is the same reason they cannot pick the game in the
 * lobby either.
 */
import { useEffect, useRef } from 'react'
import { createStore, useStore } from '../../00-core'
import { getMyName, getNet, getPeers, sendToRoom, subscribeRoom, useNet, usePeers } from '../../09-net'
import { hostChoice } from '../../13-modes'
import {
  decodePause,
  encodePause,
  mayControl,
  type PauseAct,
  type Pauser,
} from './pause'
import {
  NO_CALL,
  encodeCall,
  followCall,
  isMinigameCall,
  type MinigameCall,
} from './call'
import {
  beginRun,
  finishRun,
  freshRun,
  isPausable,
  pauseRun,
  restartRun,
  resumeRun,
  tickRun,
  type MinigameRun,
} from './registry'
import type { MinigameId } from './catalogue'
import { useTheOneSync } from './party'
import type { Standing } from './podium'

export type MinigameScreenState =
  | { at: 'closed' }
  | { at: 'dashboard' }
  | { at: 'game'; run: MinigameRun }

const CLOSED: MinigameScreenState = { at: 'closed' }

const screen = createStore<MinigameScreenState>(CLOSED)

/**
 * What the host has the party doing. Its tag is unique across the build.
 *
 * Held here rather than inside the screen store because the two are different
 * things: this is what the lobby has been told, and the store is where you are
 * actually looking. A guest who steps out of a round changes the second and
 * not the first.
 */
const call = hostChoice<MinigameCall>('minigame', isMinigameCall, NO_CALL)

/** Where the screen is, for React. */
export function useMinigameScreen(): MinigameScreenState {
  return useStore(screen)
}

/**
 * Whether this browser may work the buttons on the pause card, for React.
 *
 * Re-read when the lobby changes as well as when the screen does, because one
 * of the two answers depends on who is still here: the moment the person who
 * paused drops out, the card becomes everybody's.
 */
export function useMayControl(): boolean {
  const open = useStore(screen)
  const net = useNet()
  usePeers()
  if (open.at !== 'game') return false
  return open.run.paused && mayControl(open.run.pausedBy, net.id ?? 'you', here())
}

/**
 * Listens for somebody else stopping the round.
 *
 * Not `hostChoice`: that is host-owned by construction, and the whole point of
 * this one is that a guest can press it. It is a plain broadcast, applied by
 * everybody who hears it, the sender included - they have already applied it
 * locally, and applying it twice is what `pauseRun` and `resumeRun` returning
 * the same run make harmless.
 *
 * Nothing is repeated and nothing is asked for: a pause is a moment, not a
 * setting, so somebody who joins mid-pause is not dragged into it.
 */
export function usePauseSync(): void {
  useEffect(() => {
    return subscribeRoom((from, raw) => {
      const said = decodePause(raw)
      if (!said) return
      // The relay's sender id is authoritative. A reconnect can leave a
      // browser's carried party id one message behind, and rejecting that
      // pause would leave the other players running. Keep the supplied name
      // for the card, but use the relay id for pause ownership.
      const by = said.by.id === from ? said.by : { ...said.by, id: from }
      const now = screen.get()
      if (now.at !== 'game') return
      if (said.act !== 'pause' && !mayControl(now.run.pausedBy, by.id, here())) return
      apply(said.act, by)
    })
  }, [])
}

/** Where the screen is, for anything outside React. */
export function getMinigameScreen(): MinigameScreenState {
  return screen.get()
}

/** What the host has the party doing, for anything that needs to ask. */
export function getMinigameCall(): MinigameCall {
  return call.get()
}

/**
 * Opens the dashboard: every game there is, in a grid.
 *
 * The host's, and nobody else's. A guest has nothing to choose from, so
 * opening a catalogue for them would be offering a choice that does not exist.
 */
export function openDashboard(): void {
  screen.set({ at: 'dashboard' })
}

/**
 * Opens one game, at the beginning of a run of it.
 *
 * The host takes everybody with them. `call.set` is a no-op for a guest - see
 * `hostChoice` - so a guest calling this moves their own screen and tells
 * nobody, which is what `followCall` uses to let somebody sit a round out.
 */
export function openMinigame(id: MinigameId): void {
  screen.set({ at: 'game', run: freshRun(id) })
  call.set(encodeCall(id, 'open'))
}

/** Press play: the briefing gives way to the three-two-one, for everybody. */
export function playMinigame(): void {
  const now = screen.get()
  if (now.at !== 'game') return
  screen.set({ at: 'game', run: beginRun(now.run) })
  call.set(encodeCall(now.run.id, 'play'))
}

/**
 * The round is over: hands the screen its two seconds of **Finish**.
 *
 * Called by the game, from `useFinish`, because the game is the only thing that
 * knows when it has ended. Local: every browser's round ends on its own frame
 * and there is nothing to agree about, so this is the one part of a run that
 * does not go near the wire.
 */
export function finishMinigame(standings: readonly Standing[] | null = null): void {
  const now = screen.get()
  if (now.at !== 'game') return
  const next = finishRun(now.run, standings)
  if (next !== now.run) screen.set({ at: 'game', run: next })
}

/**
 * What a game calls to say it has ended - and asks whether it may show its
 * results yet.
 *
 * Handed the same flag the game already uses to decide whether to draw its own
 * results, so there is nothing new for a game to work out. Hands back whether
 * to draw them **now**: false through the two seconds of Finish while the game
 * dims, true once those are up. A game gates its results card on the answer and
 * that is the whole of its part in the ending.
 *
 * Fires on the edge. It also fires if the round was already over when the run
 * reached `playing` - a guest who joined as the host's round ended - so nobody
 * is left on a finished game with no results.
 *
 * **Hand it `standings` and the podium takes over from the results card.** It
 * is asked once, at the moment the round ends, so it can be as expensive as a
 * game's own `placings` and cost nothing the rest of the time. A game that
 * hands them over is never told to draw its own card: the podium is the
 * results, and its replay is the "again".
 *
 * Outside the screen (a game's own tests, mounting its panel bare) there is no
 * run to finish, and the flag is handed straight back.
 */
export function useFinish(over: boolean, standings?: () => readonly Standing[]): boolean {
  const open = useMinigameScreen()
  const phase = open.at === 'game' ? open.run.phase : null
  const was = useRef(over)
  // Read when the round ends rather than closed over when the effect was made,
  // so it is the final state that is ranked and not the one a frame before.
  const tell = useRef(standings)
  tell.current = standings
  useEffect(() => {
    const rose = over && !was.current
    was.current = over
    if (!over) return
    if (phase === 'playing' || (rose && phase === 'over')) finishMinigame(tell.current ? tell.current() : null)
  }, [over, phase])
  if (phase === null) return over
  return over && phase === 'over' && !standings
}

/**
 * The same game again, from the three-two-one, for everybody. The podium's
 * replay.
 *
 * The host's alone, the same as play: it is the host who has everybody in
 * this game. It goes out the way a restart from the pause card does - that is
 * already a fresh run of the same game for every screen in the lobby, and a
 * replay is exactly that with nobody paused.
 */
export function replayMinigame(): void {
  const now = screen.get()
  if (now.at !== 'game' || now.run.phase !== 'over' || !getNet().host) return
  announce('restart', me())
}

/**
 * Advances whichever clock is running by a slice of a second.
 *
 * Driven by the screen while there is one and by nothing else - the store
 * has no clock of its own, which is what keeps it testable.
 */
export function tickMinigame(dt: number): void {
  const now = screen.get()
  if (now.at !== 'game') return
  const next = tickRun(now.run, dt)
  if (next !== now.run) screen.set({ at: 'game', run: next })
}

/** Who this browser is, as the pause card names them. */
export function me(): Pauser {
  return { id: getNet().id ?? 'you', name: getMyName() }
}

/** Everybody in the lobby, this browser included. Alone, just you. */
function here(): string[] {
  return [me().id, ...getPeers().map((peer) => peer.id)]
}

/**
 * Whether this browser may work the buttons on the card that is up.
 *
 * The player who paused controls the card. If they leave, anybody remaining
 * can take it down, so a round is never stranded behind a pause card.
 */
export function iMayControl(): boolean {
  const now = screen.get()
  if (now.at !== 'game') return false
  return now.run.paused && mayControl(now.run.pausedBy, getNet().id ?? 'you', here())
}

/**
 * Applies one of the three to the screen. Local only - the sending is separate,
 * so a message arriving off the wire and a button pressed here go through
 * exactly the same code.
 */
function apply(act: PauseAct, by: Pauser): void {
  const now = screen.get()
  if (now.at !== 'game') return
  const next = act === 'pause' ? pauseRun(now.run, by) : act === 'resume' ? resumeRun(now.run) : restartRun(now.run)
  if (next !== now.run) screen.set({ at: 'game', run: next })
}

/** Does it here and tells the lobby. Every shared pause goes through this. */
function announce(act: PauseAct, by: Pauser): void {
  apply(act, by)
  if (getNet().status === 'joined') sendToRoom(encodePause({ act, by }))
}

/**
 * Stops the round where it stands, for everybody, and says who did it.
 *
 * Any player may pause. The pausing player's name travels with the shared
 * message so every browser can say who stopped the round.
 */
export function pauseMinigame(): void {
  const now = screen.get()
  if (now.at !== 'game' || !isPausable(now.run) || now.run.paused) return
  announce('pause', me())
}

/** Starts it again from exactly where it stopped. Only whoever stopped it. */
export function resumeMinigame(): void {
  if (!iMayControl()) return
  announce('resume', me())
}

/** Starts the whole round again, from the three-two-one. Only whoever stopped it. */
export function restartMinigame(): void {
  if (!iMayControl()) return
  announce('restart', me())
}

/**
 * One step back: a game returns to the dashboard, the dashboard closes.
 *
 * One function rather than two, because it is one gesture - the back button -
 * and the screen is the only thing that knows which of the two it currently
 * means.
 *
 * **The host leaving a game takes everybody out of it.** They are the reason
 * anybody is in it. A guest leaving takes only themselves, and sits the rest
 * of it out until the host starts something new.
 */
export function backOut(): void {
  const now = screen.get()
  // Walking out of a round you stopped lets everybody else carry on. Without
  // this, the one person who could dismiss the card leaves the lobby looking at
  // it - which is the same deadlock `mayControl` guards against, arriving by
  // the front door instead.
  if (now.at === 'game' && now.run.paused && iMayControl()) {
    if (getNet().status === 'joined') sendToRoom(encodePause({ act: 'resume', by: me() }))
  }
  screen.set(now.at === 'game' ? { at: 'dashboard' } : CLOSED)
  if (now.at === 'game') call.set(NO_CALL)
}

/** Shuts the whole thing, wherever it was. For leaving a party. */
export function closeMinigames(): void {
  screen.set(CLOSED)
  call.set(NO_CALL)
  dashboardAt = { ...DASHBOARD_START }
}

/**
 * Where the dashboard was left - which filter, and which page of tiles.
 *
 * Kept here rather than in the component so that stepping into a game and back
 * lands on the page the game was picked from: the grid unmounts while a game is
 * open. Closing the minigames screen forgets it, and the next open starts at the
 * beginning.
 */
export interface DashboardAt {
  filter: string
  page: number
}

const DASHBOARD_START: DashboardAt = { filter: 'all', page: 0 }
let dashboardAt: DashboardAt = { ...DASHBOARD_START }

export function dashboardWas(): DashboardAt {
  return dashboardAt
}

export function rememberDashboard(at: DashboardAt): void {
  dashboardAt = at
}

/**
 * Takes a guest wherever the host has gone.
 *
 * Mounted once, from something that is always up. The host's own calls come
 * back to them and are ignored - see `followCall` - so this is live for
 * everybody and does something for guests only.
 *
 * Applied on **change**, which is what lets a guest press escape, leave a
 * round, and stay left until the host starts something else. Without that they
 * would be dragged back in on the very next render and could never get out.
 */
export function useMinigameSync(): void {
  call.useSync()
  useTheOneSync()
  usePauseSync()
  const net = useNet()
  const current = call.use()
  const last = useRef<MinigameCall>(NO_CALL)

  useEffect(() => {
    const { act, open } = followCall(current, last.current, net.host)
    last.current = current
    if (!act) return
    if (!open) {
      screen.set(CLOSED)
      return
    }
    // A guest joins the briefing where the host opened it, and the round where
    // the host started it - never at a countdown they have already missed.
    screen.set({
      at: 'game',
      run: open.kind === 'play' ? beginRun(freshRun(open.id)) : freshRun(open.id),
    })
  }, [current, net.host])
}
