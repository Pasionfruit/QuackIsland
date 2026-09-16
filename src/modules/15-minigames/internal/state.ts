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
import { useNet } from '../../09-net'
import { hostChoice } from '../../13-modes'
import {
  NO_CALL,
  encodeCall,
  followCall,
  isMinigameCall,
  type MinigameCall,
} from './call'
import {
  beginRun,
  freshRun,
  pauseRun,
  resumeRun,
  tickRun,
  type MinigameRun,
} from './registry'
import type { MinigameId } from './catalogue'

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
 * Advances the countdown by a slice of a second.
 *
 * Driven by the screen while it is counting and by nothing else - the store
 * has no clock of its own, which is what keeps it testable.
 */
export function tickMinigame(dt: number): void {
  const now = screen.get()
  if (now.at !== 'game') return
  const next = tickRun(now.run, dt)
  if (next !== now.run) screen.set({ at: 'game', run: next })
}

/** Stops the round where it stands and puts a card over it. */
export function pauseMinigame(): void {
  const now = screen.get()
  if (now.at !== 'game') return
  const next = pauseRun(now.run)
  if (next !== now.run) screen.set({ at: 'game', run: next })
}

/** Starts it again from exactly where it stopped. */
export function resumeMinigame(): void {
  const now = screen.get()
  if (now.at !== 'game') return
  const next = resumeRun(now.run)
  if (next !== now.run) screen.set({ at: 'game', run: next })
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
  screen.set(now.at === 'game' ? { at: 'dashboard' } : CLOSED)
  if (now.at === 'game') call.set(NO_CALL)
}

/** Shuts the whole thing, wherever it was. For leaving a party. */
export function closeMinigames(): void {
  screen.set(CLOSED)
  call.set(NO_CALL)
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
