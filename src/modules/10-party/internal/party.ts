/**
 * The rules of getting a board game started, and where it is played.
 *
 * All pure. "Can the host press start" is a question with an exact answer that
 * depends on who is here and who has said they are ready, and getting it wrong
 * either strands people on the beach or drops somebody onto the board who was
 * not looking.
 *
 * The board is on its own island, out across the water from the spawn island.
 * Where it is and what shape it is live in `island.ts`; the spiral of tiles
 * lives in `board.ts`.
 */
import { ISLAND, distanceFromIsland, partyHeightLocalAt } from './island'
import { BOARD, buildBoard } from './board'

export type PartyPhase = 'off' | 'gathering' | 'playing'

export const PARTY = {
  /**
   * How far behind the first tile players line up, in metres.
   *
   * Behind rather than on it: arriving standing on the start of a race is
   * fine, arriving inside the tile you are about to run from is not.
   */
  startBack: 2.4,
  /** How far apart the starting line is spread, in metres. */
  startSpread: 1.8,
  /** How far above the ground players arrive, so they land rather than clip. */
  spawnLift: 0.6,
} as const

/**
 * Where the nth of `count` players lines up when the race starts.
 *
 * On the starting line, which is just outside the first tile, spread sideways
 * across the track. World coordinates, because that is what the teleport
 * wants.
 *
 * Sideways rather than in a ring: this is the start of a race, everybody
 * should be facing the same way with the same distance to run, and a ring
 * would give whoever spawned nearest the second tile a free head start.
 */
export function spawnFor(index: number, count: number): { x: number; y: number; z: number } {
  const total = Math.max(1, count)
  const nth = ((index % total) + total) % total

  const tiles = buildBoard()
  const start = tiles[0]
  const next = tiles[1] ?? start

  // Along the track, pointing from the second tile back to the first, which is
  // the direction the runners face.
  const alongX = start.x - next.x
  const alongZ = start.z - next.z
  const alongLength = Math.hypot(alongX, alongZ) || 1
  const backX = alongX / alongLength
  const backZ = alongZ / alongLength
  // And across it.
  const sideX = -backZ
  const sideZ = backX

  // Centred on the track: one player is on the middle, and the rest fan out
  // either side rather than everybody being pushed to one edge.
  const offset = (nth - (total - 1) / 2) * PARTY.startSpread

  const localX = start.x + backX * PARTY.startBack + sideX * offset
  const localZ = start.z + backZ * PARTY.startBack + sideZ * offset

  return {
    x: ISLAND.centreX + localX,
    y:
      partyHeightLocalAt(Math.hypot(localX, localZ), Math.atan2(localZ, localX)) +
      PARTY.spawnLift,
    z: ISLAND.centreZ + localZ,
  }
}

/** How many tiles there are to race along. */
export function boardSize(): number {
  return BOARD.tiles
}

/** Whether a world position is standing on the party island at all. */
export function onBoardIsland(x: number, z: number): boolean {
  return distanceFromIsland(x, z) <= ISLAND.foot
}

/**
 * Whether everybody in the lobby has said they are ready.
 *
 * `ids` is everyone who counts, including the host - the host readying up is
 * the same act as anybody else doing it, and a host who could start without
 * being ready would be starting a game they were not in.
 *
 * An empty lobby is **not** ready. Alone, you are your own lobby of one, and
 * you still have to press the button.
 */
export function allReady(ids: Iterable<string>, ready: ReadonlySet<string>): boolean {
  let any = false
  for (const id of ids) {
    any = true
    if (!ready.has(id)) return false
  }
  return any
}

/** Whether the host may press start. */
export function canStart(
  phase: PartyPhase,
  isHost: boolean,
  ids: Iterable<string>,
  ready: ReadonlySet<string>,
): boolean {
  return isHost && phase === 'gathering' && allReady(ids, ready)
}

/** What the dashboard says while waiting. */
export function waitingFor(ids: Iterable<string>, ready: ReadonlySet<string>): number {
  let waiting = 0
  for (const id of ids) if (!ready.has(id)) waiting++
  return waiting
}

/** A party message, as it goes over the room channel. */
export interface PartyMessage {
  /** The host's phase. Only the host's copy counts. */
  phase?: PartyPhase
  /** Whether the sender is ready. */
  ready?: boolean
}

/**
 * Reads a party message off the wire.
 *
 * As untrusted as everything else that arrives from another browser: a phase
 * nobody has heard of would leave the dashboard in a state with no way out.
 */
export function decodeParty(message: Record<string, unknown>): PartyMessage | null {
  if (message.t !== 'party') return null
  const out: PartyMessage = {}
  if (message.phase !== undefined) {
    // Present but wrong rejects the whole message rather than being dropped.
    // Half-trusting a garbled packet is worse than ignoring it: a phase of 7
    // and a phase of "chaos" are the same kind of wrong and should not be
    // treated differently just because one of them is a string.
    if (message.phase !== 'off' && message.phase !== 'gathering' && message.phase !== 'playing') {
      return null
    }
    out.phase = message.phase
  }
  if (message.ready !== undefined) {
    if (typeof message.ready !== 'boolean') return null
    out.ready = message.ready
  }
  return out
}

export function encodeParty(message: PartyMessage): Record<string, unknown> {
  return { t: 'party', ...message }
}
