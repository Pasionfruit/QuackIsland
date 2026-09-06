/**
 * Case Closed: a whodunit, camp edition - basically Clue.
 *
 * Turn order, positions and the public log (who suggested what, and who -
 * not what - disproved it) are host-authoritative and broadcast like any
 * other Polyland game. Two things deliberately are not: a card shown to
 * disprove a suggestion goes straight to the suggester over a private,
 * targeted relay message and never touches this engine's state at all, and
 * the solution itself never touches a client's memory until the case is
 * actually closed - the relay server deals the hands and grades every
 * accusation, because the host is also a player and would otherwise see the
 * answer before anyone made a single guess. See net/protocol.ts's
 * CaseClosedPayload and server/index.mjs's `deal`/`accuse` handlers.
 *
 * Checking whether a suggestion can be disproved walks the same clockwise
 * order on every client, one player at a time: whoever the pointer lands on
 * checks their own hand locally and broadcasts only a yes/no (never the
 * card), which is what actually advances the pointer for everyone. Nobody
 * has to wait on a host round-trip to find out whose turn it is to answer.
 */
import { type NodeId, type RoomId, type Suspect, type Weapon, ROOMS, START_NODE, SUSPECT_HOME } from './board'

export interface CCPlayer {
  slot: number
  name: string
  suspect: Suspect
  position: NodeId
  eliminated: boolean
}

export interface PendingSuggestion {
  suggester: number
  suspect: Suspect
  weapon: Weapon
  room: RoomId
  /** Clockwise check order, starting after the suggester - excludes eliminated players and the suggester themself. */
  order: number[]
  pointer: number
  disprovedBy: number | null
  resolved: boolean
}

export interface LogEntry {
  kind: 'suggest' | 'accuse'
  by: number
  suspect: Suspect
  weapon: Weapon
  room: RoomId
  /** For a suggestion: who disproved it, or null if nobody could. Unused for an accusation. */
  disprovedBy: number | null
  /** For an accusation only. */
  correct?: boolean
}

export class CaseClosedEngine {
  players: CCPlayer[] = []
  phase: 'lobby' | 'playing' | 'over' = 'lobby'
  turnIndex = 0
  lastRoll: [number, number] | null = null
  hasRolled = false
  hasSuggested = false
  pending: PendingSuggestion | null = null
  log: LogEntry[] = []
  winner: number | null = null
  solution: { suspect: Suspect; weapon: Weapon; room: RoomId } | null = null
  version = 0

  addPlayer(slot: number, name: string): void {
    if (this.players.some((p) => p.slot === slot)) return
    this.players.push({ slot, name, suspect: 'contrlzee', position: START_NODE.greenhouse, eliminated: false })
    this.players.sort((a, b) => a.slot - b.slot)
    this.version++
  }

  removePlayer(slot: number): void {
    this.players = this.players.filter((p) => p.slot !== slot)
    this.version++
  }

  /** Suspects must be distinct - the lobby's picker enforces this before calling start(). */
  start(suspectOf: Record<number, Suspect>): void {
    if (this.phase !== 'lobby' || this.players.length < 3) return
    for (const p of this.players) {
      const suspect = suspectOf[p.slot] ?? p.suspect
      p.suspect = suspect
      p.position = START_NODE[SUSPECT_HOME[suspect]]
      p.eliminated = false
    }
    this.turnIndex = 0
    this.lastRoll = null
    this.hasRolled = false
    this.hasSuggested = false
    this.pending = null
    this.log = []
    this.winner = null
    this.phase = 'playing'
    this.version++
  }

  get current(): CCPlayer | undefined {
    return this.players[this.turnIndex]
  }

  private activeSlots(): number[] {
    return this.players.filter((p) => !p.eliminated).map((p) => p.slot)
  }

  /** Rolls two dice for the current player - host calls this with real randomness. */
  roll(rand: () => number = Math.random): [number, number] {
    const a = 1 + Math.floor(rand() * 6)
    const b = 1 + Math.floor(rand() * 6)
    this.lastRoll = [a, b]
    this.hasRolled = true
    this.version++
    return [a, b]
  }

  move(slot: number, to: NodeId): void {
    const p = this.players.find((x) => x.slot === slot)
    if (!p || p.slot !== this.current?.slot || !this.hasRolled || this.pending) return
    p.position = to
    this.hasRolled = false
    this.lastRoll = null
    this.version++
  }

  /** A corner room's shortcut to its opposite corner - no roll needed, ends the turn's movement. */
  useSecretPassage(slot: number, to: NodeId): void {
    const p = this.players.find((x) => x.slot === slot)
    if (!p || p.slot !== this.current?.slot || this.pending) return
    p.position = to
    this.hasRolled = false
    this.lastRoll = null
    this.version++
  }

  /** The current player, standing in a room, names a suspect and a weapon - the room is wherever they are. */
  suggest(slot: number, suspect: Suspect, weapon: Weapon): void {
    const p = this.players.find((x) => x.slot === slot)
    if (!p || p.slot !== this.current?.slot || this.pending || this.hasSuggested) return
    if (!ROOMS.includes(p.position as RoomId)) return
    const room = p.position as RoomId
    // The named suspect's token joins the scene of the suggestion.
    const named = this.players.find((x) => x.suspect === suspect)
    if (named) named.position = room

    const order = this.activeSlots().filter((s) => s !== slot)
    // Rotate so the check order starts with whoever sits clockwise of the suggester.
    const startAt = order.findIndex((s) => s > slot)
    const rotated = startAt < 0 ? order : [...order.slice(startAt), ...order.slice(0, startAt)]

    this.hasSuggested = true
    this.pending =
      rotated.length > 0
        ? { suggester: slot, suspect, weapon, room, order: rotated, pointer: 0, disprovedBy: null, resolved: false }
        : { suggester: slot, suspect, weapon, room, order: [], pointer: 0, disprovedBy: null, resolved: true }
    if (this.pending.resolved) {
      this.log.push({ kind: 'suggest', by: slot, suspect, weapon, room, disprovedBy: null })
    }
    this.version++
  }

  /** Whoever the pending suggestion's pointer names checks their own hand and reports back - never which card. */
  reportCheck(slot: number, canDisprove: boolean): void {
    const pend = this.pending
    if (!pend || pend.resolved) return
    if (pend.order[pend.pointer] !== slot) return
    if (canDisprove) {
      pend.disprovedBy = slot
      pend.resolved = true
    } else if (pend.pointer + 1 >= pend.order.length) {
      pend.disprovedBy = null
      pend.resolved = true
    } else {
      pend.pointer++
    }
    if (pend.resolved) {
      this.log.push({ kind: 'suggest', by: pend.suggester, suspect: pend.suspect, weapon: pend.weapon, room: pend.room, disprovedBy: pend.disprovedBy })
    }
    this.version++
  }

  /** Whose turn it is to answer a pending suggestion, if any. */
  awaitingCheckFrom(): number | null {
    const pend = this.pending
    if (!pend || pend.resolved) return null
    return pend.order[pend.pointer] ?? null
  }

  clearPending(): void {
    this.pending = null
    this.version++
  }

  endTurn(slot: number): void {
    if (slot !== this.current?.slot || this.pending) return
    this.hasRolled = false
    this.hasSuggested = false
    this.lastRoll = null
    const active = this.activeSlots()
    if (active.length === 0) return
    let next = (this.turnIndex + 1) % this.players.length
    for (let guard = 0; guard < this.players.length && this.players[next]?.eliminated; guard++) {
      next = (next + 1) % this.players.length
    }
    this.turnIndex = next
    this.version++
  }

  /** A wrong accusation is out of the running for good, but stays at the table to keep disproving others. */
  eliminate(slot: number, accusation: { suspect: Suspect; weapon: Weapon; room: RoomId }): void {
    const p = this.players.find((x) => x.slot === slot)
    if (!p) return
    p.eliminated = true
    this.log.push({ kind: 'accuse', by: slot, ...accusation, disprovedBy: null, correct: false })
    if (slot === this.current?.slot) this.endTurn(slot)
    this.version++
  }

  win(slot: number, solution: { suspect: Suspect; weapon: Weapon; room: RoomId }): void {
    this.log.push({ kind: 'accuse', by: slot, ...solution, disprovedBy: null, correct: true })
    this.winner = slot
    this.solution = solution
    this.phase = 'over'
    this.version++
  }

  reveal(solution: { suspect: Suspect; weapon: Weapon; room: RoomId }): void {
    this.winner = null
    this.solution = solution
    this.phase = 'over'
    this.version++
  }

  // ---------------------------------------------------------------- netcode

  snapshot(): unknown {
    return {
      players: this.players,
      phase: this.phase,
      turnIndex: this.turnIndex,
      lastRoll: this.lastRoll,
      hasRolled: this.hasRolled,
      hasSuggested: this.hasSuggested,
      pending: this.pending,
      log: this.log,
      winner: this.winner,
      solution: this.solution,
    }
  }

  applySnapshot(s: any): void {
    if (!s) return
    this.players = s.players ?? this.players
    this.phase = s.phase ?? this.phase
    this.turnIndex = s.turnIndex ?? this.turnIndex
    this.lastRoll = s.lastRoll ?? null
    this.hasRolled = !!s.hasRolled
    this.hasSuggested = !!s.hasSuggested
    this.pending = s.pending ?? null
    this.log = s.log ?? this.log
    this.winner = s.winner ?? null
    this.solution = s.solution ?? null
    this.version++
  }
}
