/**
 * The rules of getting a board game started, and where it is played.
 *
 * All pure. "Can the host press start" is a question with an exact answer that
 * depends on who is here and who has said they are ready, and getting it wrong
 * either strands people on the beach or drops somebody onto the board who was
 * not looking.
 *
 * The arena is a separate island in the sky above the main one. Above rather
 * than beside because everything else in this world is centred on the origin -
 * the sea is a plane 1800 m across and the terrain mesh stops at 288 m - so a
 * second island out to the side would sit next to two visible edges. Straight
 * up there is nothing but sky.
 */

export type PartyPhase = 'off' | 'gathering' | 'playing'

export const PARTY = {
  /** How high above the sea the board floats. */
  height: 96,
  /** How far across the board is, in metres. */
  radius: 26,
  /** How thick the slab is. Only ever seen from below or from the edge. */
  depth: 3.2,
  /**
   * How far in from the edge players are placed.
   *
   * Not on the rim: somebody spawned exactly on the edge and holding a key
   * walks straight off it.
   */
  spawnInset: 6,
  /** How far above the board players arrive, so they land rather than clip. */
  spawnLift: 0.5,
} as const

/**
 * The height of the world while a party is running.
 *
 * Inside the board it is the board. Outside it falls back to whatever the
 * ground was before, so walking off the edge drops you back onto the island
 * rather than into nothing - which is a much better accident than falling
 * forever, and needs no railing.
 */
export function arenaHeightAt(
  x: number,
  z: number,
  below: (x: number, z: number) => number,
): number {
  return Math.hypot(x, z) <= PARTY.radius ? PARTY.height : below(x, z)
}

/** Where the nth of `count` players stands when the board opens. */
export function spawnFor(index: number, count: number): { x: number; z: number } {
  const total = Math.max(1, count)
  const nth = ((index % total) + total) % total
  const ring = PARTY.radius - PARTY.spawnInset
  // Spread evenly round a ring, so nobody arrives inside anybody else.
  const angle = (nth / total) * Math.PI * 2
  return { x: Math.sin(angle) * ring, z: Math.cos(angle) * ring }
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
