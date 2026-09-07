/**
 * Party Parade's match state.
 *
 * Event driven, with no clock and no step() - a turn-based board game
 * advances when somebody does something, so this follows Case Closed's shape
 * rather than the fixed-timestep loop the platformers and shooters use. The
 * panel still runs an animation frame loop, but only to paint; nothing here
 * is simulated per tick.
 *
 * This phase is the board itself: everyone stands on the start tile and the
 * map is drawn. Dice, movement, tile effects and minigames are later phases,
 * and the fields they need are marked below so they extend this rather than
 * replace it.
 */
import {
  CHEETAH,
  CONTRLZEE,
  DIVA,
  HONEYBEE,
  MRPASIONFRUIT,
  NIGHTSHIFT,
  NINJAPENGUIN,
  TENINCHTOENAIL,
  TUXEDOCAT,
} from '../../../art/cast'
import type { AvatarDef } from '../../../art/avatar'
import { START_INDEX } from './board'

export { VIEW_H, VIEW_W } from './board'

/**
 * The parade's line-up: the shared Polyland cast, in roster order. Players
 * are dealt one each by slot, so a four-player room always gets four
 * different animals.
 */
export interface ParadeChar {
  id: string
  name: string
  def: AvatarDef
}

export const PARADE_CAST: ParadeChar[] = [
  { id: 'contrlzee', name: 'ContrlZee', def: CONTRLZEE },
  { id: 'ninjapenguin', name: 'NinjaPenguin', def: NINJAPENGUIN },
  { id: 'teninchtoenail', name: 'teninchtoenail', def: TENINCHTOENAIL },
  { id: 'diva', name: 'diva', def: DIVA },
  { id: 'mrpasionfruit', name: 'MrPasionfruit', def: MRPASIONFRUIT },
  { id: 'nightshift', name: 'NightShift', def: NIGHTSHIFT },
  { id: 'honeybee', name: 'Wandering Honeybee', def: HONEYBEE },
  { id: 'cheetah', name: 'Frolicking Cheetah', def: CHEETAH },
  { id: 'tuxedocat', name: 'Tuxedo Cat', def: TUXEDOCAT },
]

/** Per-slot accent, for name tags and lobby dots. Every game here keeps its own. */
export const PLAYER_COLORS = [
  '#e0794f',
  '#5f92b8',
  '#8fae6a',
  '#e8c05f',
  '#c85f96',
  '#7a4f8c',
  '#4fb0a5',
  '#c0653f',
]

/**
 * Only 'board' is reachable in this phase. The other two are reserved so the
 * minigame round and the match end extend this union instead of reshaping
 * every switch over it later.
 */
export type Phase = 'board' | 'minigame' | 'over'

export interface PPPlayer {
  slot: number
  name: string
  /** Index into PARADE_CAST - which animal this pawn is. */
  castIndex: number
  color: string
  /** Index into BOARD_TILES. Everyone starts on the loop's first tile. */
  tileIndex: number
}

export class PartyParadeEngine {
  players: PPPlayer[] = []
  phase: Phase = 'board'
  /** Bumped by every mutation, the same convention the other engines use. */
  version = 0

  addPlayer(slot: number, name: string): void {
    if (this.players.some((p) => p.slot === slot)) return
    this.players.push({
      slot,
      name: name || `Player ${slot + 1}`,
      castIndex: slot % PARADE_CAST.length,
      color: PLAYER_COLORS[slot % PLAYER_COLORS.length],
      tileIndex: START_INDEX,
    })
    this.players.sort((a, b) => a.slot - b.slot)
    this.version++
  }

  removePlayer(slot: number): void {
    this.players = this.players.filter((p) => p.slot !== slot)
    this.version++
  }

  playerAt(slot: number): PPPlayer | undefined {
    return this.players.find((p) => p.slot === slot)
  }

  /** Everyone sharing a tile, in slot order - the renderer spreads them out so nobody hides behind anybody. */
  playersOnTile(tileIndex: number): PPPlayer[] {
    return this.players.filter((p) => p.tileIndex === tileIndex)
  }

  // Reserved for the phases after this one, so the shape above does not have
  // to change when they land:
  //   turnIndex / get current()          - whose turn it is        (dice)
  //   roll()                             - the die                 (dice)
  //   move(slot, steps)                  - nextTileIndex() in board.ts (movement)
  //   resolveTile(slot)                  - reads BOARD_TILES[i].kind (obstacles)
  //   enterMinigame() / exitMinigame()   - flips `phase`            (minigames)

  snapshot() {
    return {
      phase: this.phase,
      players: this.players.map((p) => ({ ...p })),
    }
  }

  applySnapshot(s: ReturnType<PartyParadeEngine['snapshot']>): void {
    if (!s) return
    this.phase = s.phase ?? this.phase
    this.players = s.players ?? this.players
    this.version++
  }
}
